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

import { seedSnapshot } from "./seed"
import type { Budget, Row } from "./types"

/** What a screen reads: the rows, and the envelopes that came with them. */
export type LedgerSnapshot = {
  rows: Row[]
  budgets: Budget[]
}

const STORAGE_KEY = "trackit-ledger"

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
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return bundled()
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return bundled()
    const store = parsed as Record<string, unknown>
    const rows = Array.isArray(store.rows) ? store.rows.filter(isRow) : []
    const budgets = Array.isArray(store.budgets) ? store.budgets.filter(isBudget) : []
    return { rows: newestFirst(rows), budgets }
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
  for (const row of next.rows ?? []) {
    if (knownRows.has(row.id)) {
      skipped += 1
      continue
    }
    knownRows.add(row.id)
    fresh.push(row)
  }

  const knownBudgets = new Set(current.budgets.map((budget) => budget.id))
  const freshBudgets = (next.budgets ?? []).filter((budget) => !knownBudgets.has(budget.id))

  const merged: LedgerSnapshot = {
    rows: newestFirst([...fresh, ...current.rows]).slice(0, LIMIT),
    budgets: [...current.budgets, ...freshBudgets],
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, ...merged }))
  } catch {
    // Storage is a convenience here, not the point of the screen: carry on with
    // the snapshot in memory so this session still shows what was imported.
  }
  commit(merged)
  return { added: fresh.length, skipped }
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, rows: [], budgets: [] }))
  } catch {
    // Nothing to do about a refusal; the caller reports the rows either way.
  }
  commit(EMPTY_LEDGER)
  return rows
}

/** Watch the store. The returned function stops watching. */
export function subscribeLedger(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
