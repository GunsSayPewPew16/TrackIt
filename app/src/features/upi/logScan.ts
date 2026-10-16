/**
 * What the scanner does with a code it read: one row, on the device's own ledger.
 *
 * Two ways in, one row each, and which one happens is decided by the code itself:
 *
 * - **A code that carries its amount** (`am`) is logged on the spot, under **Wallet -
 *   OneClick record** — the category that exists for exactly this — with the VPA as the
 *   note, and the screen's status line says so. This is the previous app's behaviour and
 *   it stays: the amount was printed by the merchant, so there is nothing to ask.
 * - **A code that carries no amount** is not guessed at. It opens the money screen
 *   (`components/PaySheet.tsx`), where the owner types the amount, picks the category and
 *   may add a note, and only then is the row written. `logPaidPayee` is that second entry
 *   point, and the sentence it returns is what the scanner says once the screen is closed.
 *
 * Both halves build their row here, through `rowFor`, because the two must not disagree
 * about what a scanned row is — and the id is the same in both: the payee's own address
 * plus the amount, so re-reading a code, or typing the same amount to the same merchant
 * twice, is the same row rather than a second one. `appendToLedger` skips it by id, and
 * the sentence says so in words instead of silently doing nothing.
 *
 * It returns the sentence rather than painting it: the screen's status line is the design's
 * one line of prose (the artboard's hint, `role="status"`), and the flow's answer belongs
 * there whether it is a receipt or a refusal.
 */

import { appendToLedger } from "@/lib/ledger"
import type { Row } from "@/lib/types"
import type { UpiPayee } from "./upi"

/** What the money screen collected: the amount the owner confirmed, and how it was filed. */
export type PaidDraft = {
  amountCents: number
  /** A category id from `lib/categories.ts`. */
  category: string
  /** The owner's own words, empty when they wrote none. */
  note: string
}

/** The category a code that carries its own amount is filed under, as it always was. */
const ONE_CLICK_CATEGORY = "oneclick"

/**
 * The row a scanned payee becomes.
 *
 * `note` falls back to the payee's address for the same reason the one-click path has
 * always written it there: a merchant's name alone would not say which VPA the money went
 * to, and that is the one thing a scanned row can know that a typed one cannot.
 */
function rowFor(payee: UpiPayee, draft: PaidDraft): Row {
  return {
    id: `upi-${payee.pa}-${draft.amountCents}`,
    title: payee.pn,
    category: draft.category,
    account: "upi",
    amountCents: draft.amountCents,
    kind: "expense",
    at: Date.now(),
    note: draft.note.trim() || payee.pa,
    // Scanned money is the one row whose amount was confirmed against a payment the owner
    // was about to make, which is what `upi` marks.
    source: "upi",
  }
}

/** Write it, and answer with the sentence the screen should show. */
function write(row: Row, payee: UpiPayee): string {
  const { added } = appendToLedger({ rows: [row] })
  return added > 0 ? `Logged ${payee.pn} — it is on the ledger now.` : `${payee.pn} was already logged.`
}

/**
 * Log a payee whose code carried its own amount. A code without one is not this function's
 * business: it opens the money screen instead, and comes back through `logPaidPayee`.
 */
export function logScannedPayee(payee: UpiPayee): string {
  if (payee.amountCents === null) {
    // Only reachable if something calls this for a code that has no amount. The scanner
    // routes those to the sheet, and says so rather than logging a number nobody gave.
    return `${payee.pn}'s code carries no amount. Enter it and the row is logged.`
  }
  return write(rowFor(payee, { amountCents: payee.amountCents, category: ONE_CLICK_CATEGORY, note: payee.pa }), payee)
}

/** Log what the money screen collected, and answer with the sentence for the status line. */
export function logPaidPayee(payee: UpiPayee, draft: PaidDraft): string {
  return write(rowFor(payee, draft), payee)
}
