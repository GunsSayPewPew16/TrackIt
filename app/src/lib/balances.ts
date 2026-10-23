/**
 * What each account holds, and the owner's own figure for it.
 *
 * `lib/accounts.ts` carries the **opening** balances `tools/wallet-import.py` read out of the
 * Wallet export, and the dashboard's card is derived from them: opening, plus the account's
 * income, minus its expenses (`lib/derive.ts`). That derivation is the honest one — a balance
 * is a fact about the history, not a number somebody typed — but it also means the app cannot
 * be told what the account *actually* holds after a cash withdrawal nobody logged, a split
 * bill, or a month of history that predates the export.
 *
 * So the owner can set either card's balance by holding it. What is stored is not the figure
 * they typed; it is the **opening that would make today's figure the one they typed**:
 *
 *     opening = typed − (income − expenses)
 *
 * That is the whole point of storing it this way. A stored balance would be stale the moment
 * the next row was logged, and the card would stop being a balance at all; an opening is the
 * same kind of number the import provides, so every future row moves the card exactly as it
 * moves the others, and a re-import of the same history still adds up.
 *
 * The store is the budget editor's (`lib/budget.ts`): one key, one cached snapshot so
 * `useSyncExternalStore` can compare by identity, listeners, and best-effort storage. It is
 * **per ledger**, like the rows themselves, not per device: `trackit-balances` is the device's
 * own, and a signed-in account gets `trackit-balances:u:<uuid>`. The import's openings belong
 * to the imported history; a second account on the same phone starts at **zero**, and an
 * account that has never been given a balance owes the device's figures nothing. The owner's
 * own account takes the device's copy over on its first sign-in (`adoptDeviceBalances`), so
 * the figures set before accounts existed are not lost.
 */

import { ACCOUNTS, accountFor } from "./accounts"
import type { Row } from "./types"

/** The openings as the app holds them, in integer paise, keyed by account id. */
export type AccountOpenings = Record<string, number>

const STORAGE_KEY = "trackit-balances"

/** The import's own figures, which is what a browser with nothing stored has. */
const DEFAULTS: AccountOpenings = Object.fromEntries(
  ACCOUNTS.map((account) => [account.id, account.openingCents]),
)

/**
 * What an account starts from before the owner gives it a balance: nothing.
 *
 * The import's openings are the owner's Wallet history, not a fact about every sign-in, so
 * they are the **device** ledger's default and never an account's. A new login showing
 * somebody else's ₹18,084 would be worse than showing zero.
 */
const ZERO: AccountOpenings = Object.fromEntries(ACCOUNTS.map((account) => [account.id, 0]))

/**
 * Whose figures these are: `null` for the device's own ledger, an account id once signed in.
 *
 * The key carries the owner (`trackit-balances:u:<uuid>`), exactly as the ledger's cache does,
 * so two accounts on one phone cannot inherit each other's money and signing out hands the
 * device its own figures back.
 */
let owner: string | null = null

/** The device's figures, captured on the way into an account so the owner's can adopt them. */
let carried: AccountOpenings | null = null

/** A key under the current owner's name: the device's own, or `<base>:u:<uuid>` once signed in. */
export const ownerStorageKey = (base: string): string => (owner === null ? base : `${base}:u:${owner}`)

const storageKey = (): string => ownerStorageKey(STORAGE_KEY)

const defaults = (): AccountOpenings => (owner === null ? DEFAULTS : ZERO)

let cache: AccountOpenings | null = null
const listeners = new Set<() => void>()

const announce = (): void => {
  for (const listener of listeners) listener()
}

function read(): AccountOpenings {
  const fallback = defaults()
  const openings: AccountOpenings = { ...fallback }
  try {
    const raw = window.localStorage.getItem(storageKey())
    if (!raw) return openings
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return openings
    // Every stored opening is kept, not only the two accounts': a custom card has one too
    // (`lib/customCards.ts`). A value that is not a whole, finite number of paise is dropped.
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) openings[id] = Math.round(value)
    }
    return openings
  } catch {
    return openings
  }
}

/** Every opening, handed back by reference until something changes. */
export function openingSnapshot(): AccountOpenings {
  if (cache === null) cache = read()
  return cache
}

/** What the owner's own rows have done to one account: income in, expenses out. */
export function netOf(rows: Row[], accountId: string): number {
  let net = 0
  for (const row of rows) {
    if (accountFor(row.account).id !== accountId) continue
    net += row.kind === "income" ? row.amountCents : -row.amountCents
  }
  return net
}

/**
 * What transfers have done to one account: in minus out, in paise.
 *
 * A card reads its opening, plus its rows, plus this. The balance editor therefore has to take
 * it back out again before it stores an opening — which is why it is here and not only in
 * `lib/derive.ts`, where the card is drawn.
 */
export function movedFor(transfers: readonly Transfer[], accountId: string): number {
  let moved = 0
  for (const move of transfers) {
    if (move.to === accountId) moved += move.cents
    if (move.from === accountId) moved -= move.cents
  }
  return moved
}

/**
 * The opening that makes this account read `targetCents` today.
 *
 * The rows and the transfers are both taken back out: what the owner typed is what the card
 * shows, and the two ways the figure has moved since its opening are not the editor's business.
 */
export function openingFor(
  rows: Row[],
  accountId: string,
  targetCents: number,
  movedCents = 0,
): number {
  return Math.round(targetCents) - netOf(rows, accountId) - movedCents
}

/**
 * Set what an account reads today, and tell every card that draws it.
 *
 * The figure is what the card shows, so a typed `₹2,400` is a card that says ₹2,400 — not an
 * opening that happens to work out to it after the next row lands.
 */
export function setAccountBalance(
  accountId: string,
  targetCents: number,
  rows: Row[],
  movedCents = 0,
): void {
  const next = {
    ...openingSnapshot(),
    [accountId]: openingFor(rows, accountId, Math.max(0, targetCents), movedCents),
  }
  cache = next
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(next))
  } catch {
    // The new balance still holds for this session; only remembering it was refused.
  }
  announce()
}

/**
 * Point the store at an account's own figures, or back at the device's.
 *
 * The device's snapshot is kept on the way out of it, because it is what the owner's account
 * adopts (`adoptDeviceBalances`). The cache is dropped rather than copied: the next
 * `openingSnapshot()` reads the new key, and every card is told to look again.
 */
export function setBalancesOwner(userId: string | null): void {
  if (owner === userId) return
  if (owner === null) carried = openingSnapshot()
  if (userId === null) carried = null
  owner = userId
  cache = null
  transfers = null
  announce()
}

/**
 * Hand the device's figures to the account that has just signed in.
 *
 * Only the owner's account should call this — the caller is the same one that decides the
 * ledger claim (`lib/cloud.ts`, compared to `OWNER_NAME`) — because these are the import's
 * openings, the owner's own Wallet history, and a second account must start at zero. It writes
 * once: an account that already has figures keeps them, so a balance set on this account is
 * never overwritten by a later sign-in.
 */
export function adoptDeviceBalances(): void {
  if (owner === null || carried === null) return
  try {
    if (window.localStorage.getItem(storageKey()) !== null) return
  } catch {
    // A store that cannot be read cannot be written safely either; zero stands.
    return
  }
  cache = { ...carried }
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(cache))
  } catch {
    // This session still draws the adopted figures; only remembering them was refused.
  }
  announce()
}

/**
 * A transfer between two accounts: money moved from one to another, in paise.
 *
 * It is not a row. A transfer has no category, is not spending or income, and must not appear
 * in the ledger or the statistics, so it lives in its own list and only the cards read it:
 * `dashboardModel` takes the from-account down and the to-account up by the amount.
 */
export type Transfer = { id: string; from: string; to: string; cents: number; at: number }

const TRANSFERS_KEY = "trackit-transfers"

let transfers: Transfer[] | null = null

function readTransfers(): Transfer[] {
  try {
    const raw = window.localStorage.getItem(ownerStorageKey(TRANSFERS_KEY))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is Transfer =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Transfer).id === "string" &&
        typeof (item as Transfer).from === "string" &&
        typeof (item as Transfer).to === "string" &&
        typeof (item as Transfer).cents === "number" &&
        Number.isFinite((item as Transfer).cents),
    )
  } catch {
    return []
  }
}

/** Every transfer on this ledger, handed back by reference until one is added. */
export function transfersSnapshot(): Transfer[] {
  if (transfers === null) transfers = readTransfers()
  return transfers
}

/**
 * Record a move of money between two accounts. It changes what each card reads and nothing
 * else: no row is written, so the ledger and the statistics do not see it.
 */
export function addTransfer(from: string, to: string, cents: number): void {
  if (from === to || !(cents > 0)) return
  const entry: Transfer = {
    id: `transfer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from,
    to,
    cents: Math.round(cents),
    at: Date.now(),
  }
  transfers = [...transfersSnapshot(), entry]
  try {
    window.localStorage.setItem(ownerStorageKey(TRANSFERS_KEY), JSON.stringify(transfers))
  } catch {
    // The move still holds for this session; only remembering it was refused.
  }
  announce()
}

/** Watch the store. The returned function stops watching. */
export function subscribeBalances(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
