/**
 * The rows the owner's history arrived as, kept on this device.
 *
 * An import is the owner's own history, and it is worth more than the screen it
 * lands on: React state is not a ledger — it is gone the next time the page is
 * opened, which is exactly when the owner comes back to look at it. So the rows
 * and the budgets that came with them are kept in `localStorage`, which is the
 * only storage this app has (there is no server it talks to).
 *
 * The rules the rest of the app follows are kept here too: money as integer
 * paise, one absolute timestamp per row rather than a stored "days ago" that
 * would go stale, and rows always newest first.
 *
 * Everything here is best-effort. A browser that refuses storage (private mode, a
 * hardened profile, a full quota) must cost the owner a remembered row, not the
 * page they are using, and one corrupt entry must not be able to take the ledger
 * down with it.
 */

import { refile, refileBudget, refileRow } from "./refile"
import { seedSnapshot } from "./seed"
import type { Budget, Row } from "./types"

/** What a screen reads: the rows, and the envelopes that came with them. */
export type LedgerSnapshot = {
  rows: Row[]
  budgets: Budget[]
}

const STORAGE_KEY = "trackit-ledger"

/**
 * Whose cache this is: `null` for the device's own ledger, an account id once signed in.
 *
 * The key carries it (`trackit-ledger:u:<uuid>`) rather than every account sharing one, so two
 * people using the same phone cannot see each other's money, and signing out hands the device
 * back the ledger it had before. Nothing is deleted by a sign-out: the account's cache is still
 * at its own key the next time it signs in with no network.
 */
let owner: string | null = null

const storageKey = (): string => (owner === null ? STORAGE_KEY : `${STORAGE_KEY}:u:${owner}`)

/** An import of a year of history is a few hundred rows; this is many years. */
const LIMIT = 5000

/**
 * The snapshot a browser with nothing stored has, and the one a refused or
 * unreadable store falls back to. It is a **shared constant**, not a fresh
 * object per call, because `useSyncExternalStore` compares snapshots by identity.
 */
export const EMPTY_LEDGER: LedgerSnapshot = { rows: [], budgets: [] }

/** The snapshot last read or written, so the identity above holds. */
let cache: LedgerSnapshot | null = null

const listeners = new Set<() => void>()

/** A row that came back from storage, if it is still the shape this file writes. */
function isRow(value: unknown): value is Row {
  if (typeof value !== "object" || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    typeof row.category === "string" &&
    typeof row.account === "string" &&
    typeof row.amountCents === "number" &&
    Number.isFinite(row.amountCents) &&
    (row.kind === "expense" || row.kind === "income") &&
    typeof row.at === "number" &&
    Number.isFinite(row.at)
  )
}

/** A budget that came back from storage, if it is still the shape this file writes. */
function isBudget(value: unknown): value is Budget {
  if (typeof value !== "object" || value === null) return false
  const budget = value as Record<string, unknown>
  return (
    typeof budget.id === "string" &&
    typeof budget.name === "string" &&
    typeof budget.limitCents === "number" &&
    Number.isFinite(budget.limitCents) &&
    Array.isArray(budget.categoryIds) &&
    budget.categoryIds.every((id) => typeof id === "string") &&
    typeof budget.startDate === "number" &&
    Number.isFinite(budget.startDate)
  )
}

const newestFirst = (rows: Row[]): Row[] => [...rows].sort((a, b) => b.at - a.at)

/**
 * The bundled expenses sheet, newest first. It is what a browser with nothing stored shows, and
 * what one whose store is refused or unreadable shows too: the owner sees their money either way.
 */
function bundled(): LedgerSnapshot {
  const seed = seedSnapshot()
  return { rows: newestFirst(seed.rows), budgets: seed.budgets }
}

/** Whatever is stored, read once and validated. */
function read(): LedgerSnapshot {
  try {
    const raw = window.localStorage.getItem(storageKey())
    // A signed-in account with nothing stored is **empty**, not the bundled sheet: the account
    // is the truth once there is one, and showing the owner's demo rows under somebody else's
    // login would be money that is not theirs.
    if (!raw) return owner === null ? bundled() : EMPTY_LEDGER
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return bundled()
    const store = parsed as Record<string, unknown>
    const storedRows = Array.isArray(store.rows) ? store.rows.filter(isRow) : []
    const storedBudgets = Array.isArray(store.budgets) ? store.budgets.filter(isBudget) : []
    /*
     * A ledger written before the new tree existed still files rows under Wallet's older
     * envelope names. They are re-filed on the way out (`lib/refile.ts`), and the store is
     * rewritten in the same pass, so what is on disk is what the screens show — once. A
     * second read finds nothing to change and writes nothing.
     */
    const { rows, budgets, changed } = refile(storedRows, storedBudgets)
    const snapshot: LedgerSnapshot = { rows: newestFirst(rows), budgets }
    if (changed > 0) {
      try {
        window.localStorage.setItem(storageKey(), JSON.stringify({ v: 1, ...snapshot }))
      } catch {
        // A refused write costs the owner nothing but the wait: the read is re-filed
        // anyway, so this session and every later one still show the new tree.
      }
    }
    return snapshot
  } catch {
    return bundled()
  }
}

/**
 * Everything stored, newest first.
 *
 * The result is cached and handed back by reference until something is written,
 * which is what lets a React screen subscribe to it: a new object on every call
 * would re-render on every read.
 */
export function ledgerSnapshot(): LedgerSnapshot {
  if (cache === null) cache = read()
  return cache
}

/** Tell whoever is listening that the store changed, and forget what was cached. */
function commit(next: LedgerSnapshot): void {
  cache = next
  for (const listener of listeners) listener()
}

/**
 * Add rows and budgets to what is stored, skipping any whose id is already there.
 *
 * Skipping by id rather than appending blindly is what makes a second import of
 * the same file safe, which is the mistake anyone makes with a backup. Rows and
 * budgets are deduplicated separately, because a file may carry one without the
 * other, and `added`/`skipped` count **rows** — the thing an import report is
 * about.
 */
export function appendToLedger(next: { rows?: Row[]; budgets?: Budget[] }): {
  added: number
  skipped: number
} {
  const current = ledgerSnapshot()
  const knownRows = new Set(current.rows.map((row) => row.id))
  const fresh: Row[] = []
  let skipped = 0
  for (const incoming of next.rows ?? []) {
    if (knownRows.has(incoming.id)) {
      skipped += 1
      continue
    }
    knownRows.add(incoming.id)
    // An imported file is re-filed like everything else: a backup made before the new
    // tree existed lands on the tree the app files under today.
    fresh.push(refileRow(incoming))
  }

  const knownBudgets = new Set(current.budgets.map((budget) => budget.id))
  const freshBudgets = (next.budgets ?? [])
    .filter((budget) => !knownBudgets.has(budget.id))
    .map(refileBudget)

  const merged: LedgerSnapshot = {
    rows: newestFirst([...fresh, ...current.rows]).slice(0, LIMIT),
    budgets: [...current.budgets, ...freshBudgets],
  }

  try {
    window.localStorage.setItem(storageKey(), JSON.stringify({ v: 1, ...merged }))
  } catch {
    // Storage is a convenience here, not the point of the screen: carry on with
    // the snapshot in memory so this session still shows what was imported.
  }
  commit(merged)
  // The cloud copy is written *from this same call*, so a screen never has to remember to sync:
  // a sink is how `lib/cloud.ts` hears about an import, a manual row, a scanned payment or a
  // payment's edit without any of those call sites knowing it exists.
  sink?.upsert(fresh, freshBudgets)
  return { added: fresh.length, skipped }
}

/**
 * Forget one row, and say whether it was there.
 *
 * A long press on a card is the owner's way of taking a row back — a duplicate, a thing they
 * did not buy, a payment they cancelled. Deleting is a **write**, so it goes through the same
 * store as an import: the snapshot is rewritten (minus the row, with the budgets untouched)
 * and every screen subscribed to it redraws. The result is that the row is gone after a
 * reload too, which is the whole difference between this and hiding it.
 *
 * Unknown ids are a no-op rather than a removal of something else: the card's id came from
 * the list it was drawn in, and a stale one must not be able to take a neighbouring row with
 * it.
 */
export function removeFromLedger(id: string): boolean {
  const current = ledgerSnapshot()
  const rows = current.rows.filter((row) => row.id !== id)
  if (rows.length === current.rows.length) return false

  const next: LedgerSnapshot = { rows, budgets: current.budgets }
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify({ v: 1, ...next }))
  } catch {
    // A refused write still removes it for this session, which is better than nothing.
  }
  commit(next)
  sink?.remove(id)
  return true
}

/**
 * Forget everything, and say how many rows were let go of.
 *
 * This stores an empty ledger rather than removing the key: a removed key reads as "never stored",
 * which would bring the bundled sheet back the moment the owner cleared it.
 */
export function clearLedger(): number {
  const rows = ledgerSnapshot().rows.length
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify({ v: 1, rows: [], budgets: [] }))
  } catch {
    // Nothing to do about a refusal; the caller reports the rows either way.
  }
  commit(EMPTY_LEDGER)
  sink?.clear()
  return rows
}

/**
 * Point the store at an account's cache, or back at the device's own.
 *
 * The cache is dropped rather than copied: the next `ledgerSnapshot()` reads the new key, and
 * every subscriber is told to look again. `lib/cloud.ts` calls this on the way in and out of a
 * session, so no screen has to know which ledger it is reading.
 */
export function setLedgerOwner(userId: string | null): void {
  if (owner === userId) return
  owner = userId
  cache = null
  for (const listener of listeners) listener()
}

/**
 * Write a whole snapshot over the cache, without telling the cloud.
 *
 * This is what a pull from Postgres lands on, and it must not echo back out as an upload — which
 * is why it takes no sink. The rows are sorted newest first like every other write, so the
 * screens cannot tell a pulled ledger from a typed one.
 */
export function replaceLedger(next: LedgerSnapshot): void {
  const snapshot: LedgerSnapshot = { rows: newestFirst(next.rows), budgets: next.budgets }
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify({ v: 1, ...snapshot }))
  } catch {
    // Memory still carries it, which is what the screens read.
  }
  commit(snapshot)
}

/**
 * The cloud's ear on this store: one call per kind of change, none of them required.
 *
 * A sink is registered only while an account is signed in (`lib/cloud.ts`), so the device-only
 * build has `null` here and every call below is a no-op rather than a branch at each call site.
 */
export type LedgerSink = {
  upsert: (rows: Row[], budgets: Budget[]) => void
  remove: (id: string) => void
  clear: () => void
}

let sink: LedgerSink | null = null

/** Watch this store, or stop watching it with `null`. */
export function setLedgerSink(next: LedgerSink | null): void {
  sink = next
}

/** Watch the store. The returned function stops watching. */
export function subscribeLedger(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
