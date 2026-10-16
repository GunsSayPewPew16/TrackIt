/**
 * The rows this site added to the demo — a scan-and-pay handoff, or an import.
 *
 * A handoff is one-way: the app that opens tells this page nothing about what
 * happened, so the row written at the moment of the tap is the *only* record that
 * the owner was about to pay someone. And an import is the owner's own history,
 * which is worth more than the demo it lands in. Either way, React state is not a
 * ledger: it is gone the next time the page is opened, which is exactly when the
 * owner comes back to look. So both are kept here.
 *
 * `localStorage`, deliberately: this site has no server, and the rules the app
 * itself follows are kept here — money as integer paise, and one absolute
 * timestamp per row rather than a stored "days ago", which would go stale. Only
 * what was *added* is stored; the demo rows in `ExpenseTracker` stay the seed they
 * always were, so a first visit looks the same on every browser.
 *
 * Everything here is best-effort: a browser that refuses storage (private mode, a
 * hardened profile, a full quota) must cost the owner a remembered row, not the
 * page they are using.
 */

/** One added row, as it is stored. */
export type LedgerRow = {
  id: string
  /** What the ledger lists: the owner's note, or the payee's name. */
  title: string
  /** One of `ExpenseTracker`'s four buckets, or whatever an import resolved to. */
  category: string
  /** Integer paise, the only money shape this project knows. */
  amountCents: number
  /** When it happened, epoch ms. Day and time are derived from this. */
  at: number
  /** Who a payment was handed to, by name: "Google Pay", or the generic link. */
  handedTo?: string
  /** Labels the row carries, which an import may bring with it. */
  tags?: string[]
}

const STORAGE_KEY = "trackit-mockup-ledger"

/** A demonstration does not need history for ever — this is many screens of it. */
const LIMIT = 500

/** A row that came back from storage, if it is still the shape this file writes. */
function isLedgerRow(value: unknown): value is LedgerRow {
  if (typeof value !== "object" || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    typeof row.category === "string" &&
    typeof row.amountCents === "number" &&
    Number.isFinite(row.amountCents) &&
    typeof row.at === "number" &&
    Number.isFinite(row.at) &&
    (row.handedTo === undefined || typeof row.handedTo === "string") &&
    (row.tags === undefined || (Array.isArray(row.tags) && row.tags.every((tag) => typeof tag === "string")))
  )
}

/**
 * Every row this browser has added, newest first.
 *
 * Anything unreadable is dropped rather than thrown: one corrupt entry must not be
 * able to take the ledger down with it.
 */
export function readLedgerRows(): LedgerRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isLedgerRow).sort((a, b) => b.at - a.at)
  } catch {
    return []
  }
}

/** How much of an import (or handoff) actually landed, and what did not. */
export type AppendResult = {
  /** Rows written: not already here. */
  added: number
  /** Rows already in the ledger, by id — importing the same file twice is a no-op. */
  skipped: number
}

/**
 * Add rows to what is remembered, skipping any whose id is already there.
 *
 * Skipping by id rather than appending blindly is what makes a second import of
 * the same file safe, which is the mistake anyone makes. `readLedgerRows` sorts
 * newest first, and the cap drops the oldest rows past it.
 */
export function appendLedgerRows(rows: LedgerRow[]): AppendResult {
  const known = readLedgerRows()
  const seen = new Set(known.map((row) => row.id))
  const fresh: LedgerRow[] = []
  let skipped = 0
  for (const row of rows) {
    if (seen.has(row.id)) {
      skipped += 1
      continue
    }
    seen.add(row.id)
    fresh.push(row)
  }
  try {
    const merged = [...fresh, ...known].sort((a, b) => b.at - a.at).slice(0, LIMIT)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  } catch {
    // Storage is a convenience here, not the point of the screen: carry on.
  }
  return { added: fresh.length, skipped }
}

/** Forget every added row, and say how many were let go of. */
export function clearLedgerRows(): number {
  const rows = readLedgerRows()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do about a refusal; the caller reports the rows either way.
  }
  return rows.length
}
