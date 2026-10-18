/**
 * What the scanner does with a code it read: one row, on the device's own ledger.
 *
 * There is one way in now. A scanned code opens the *add-record screen as a payment*
 * (`features/manual-entry`, opened through `App.tsx`'s `openEntry`), because the two numbers a
 * scanned row needs — the amount and the category — belong to the owner even when the merchant
 * printed one of them on the code. `logPaidPayee` is what that screen's confirm calls, and the
 * sentence it returns is what the scanner's status line says once the sheet closes.
 *
 * The row is built in one place, `rowFor`, because the scanner and anything else that logs a
 * scanned payment must not disagree about what one is — and the id is the same in both: the
 * payee's own address plus the amount, so re-reading a code, or typing the same amount to the
 * same merchant twice, is the same row rather than a second one. `appendToLedger` skips it by
 * id, and the sentence says so in words instead of silently doing nothing.
 *
 * It returns the sentence rather than painting it: the screen's status line is the design's
 * one line of prose (the artboard's hint, `role="status"`), and the flow's answer belongs
 * there whether it is a receipt or a refusal.
 */

import { appendToLedger } from "@/lib/ledger"
import type { Row } from "@/lib/types"
import type { UpiPayee } from "./upi"

/** What the payment screen collected: the amount the owner confirmed, and how it was filed. */
export type PaidDraft = {
  amountCents: number
  /** A category id from `lib/categories.ts`. */
  category: string
  /** The owner's own words, empty when they wrote none. */
  note: string
  /**
   * What the owner called the merchant, when they typed a name of their own. A scanned
   * row is the *payee's*, so this is only ever an override — the code's own `pn` is what
   * the row says otherwise.
   */
  title?: string
}

/**
 * The row a scanned payee becomes.
 *
 * `note` falls back to the payee's address for the same reason the scanner has always
 * written it there: a merchant's name alone would not say which VPA the money went to,
 * and that is the one thing a scanned row can know that a typed one cannot.
 */
function rowFor(payee: UpiPayee, draft: PaidDraft): Row {
  return {
    id: `upi-${payee.pa}-${draft.amountCents}`,
    title: draft.title?.trim() || payee.pn,
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

/** Log what the payment screen collected, and answer with the sentence for the status line. */
export function logPaidPayee(payee: UpiPayee, draft: PaidDraft): string {
  const row = rowFor(payee, draft)
  const { added } = appendToLedger({ rows: [row] })
  return added > 0 ? `Logged ${payee.pn} — it is on the ledger now.` : `${payee.pn} was already logged.`
}
