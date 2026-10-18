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
 * per device, like the limits — `public.budgets` in the schema mirrors the export's own
 * envelopes, not the app's two numbers.
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

let cache: AccountOpenings | null = null
const listeners = new Set<() => void>()

/** A stored opening is kept only if it is a whole, finite number of paise. */
function openingFrom(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback
}

function read(): AccountOpenings {
  const openings: AccountOpenings = { ...DEFAULTS }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return openings
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return openings
    const store = parsed as Record<string, unknown>
    for (const account of ACCOUNTS) {
      openings[account.id] = openingFrom(store[account.id], DEFAULTS[account.id])
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

/** The opening that makes this account read `targetCents` today. */
export function openingFor(rows: Row[], accountId: string, targetCents: number): number {
  return Math.round(targetCents) - netOf(rows, accountId)
}

/**
 * Set what an account reads today, and tell every card that draws it.
 *
 * The figure is what the card shows, so a typed `₹2,400` is a card that says ₹2,400 — not an
 * opening that happens to work out to it after the next row lands.
 */
export function setAccountBalance(accountId: string, targetCents: number, rows: Row[]): void {
  const next = { ...openingSnapshot(), [accountId]: openingFor(rows, accountId, Math.max(0, targetCents)) }
  cache = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // The new balance still holds for this session; only remembering it was refused.
  }
  for (const listener of listeners) listener()
}

/** Watch the store. The returned function stops watching. */
export function subscribeBalances(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
