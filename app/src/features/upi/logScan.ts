/**
 * What the scanner does with a code it read: one row, on the device's own ledger.
 *
 * This is the whole of the scan-and-log flow, and it is deliberately small. The
 * owner asked for the UPI scanner to survive the redesign, and the redesign's own
 * screen (`components/ScanScreen.tsx`) says *Scan to pay* — but there is still no pay
 * sheet in this design, so nothing here hands a `upi://` link to another app. What it
 * does instead is what the previous app did with a scanned code: a code that already
 * carries an amount is logged under **Wallet - OneClick record** — the category that
 * exists for exactly this — and a code without one is refused out loud rather than
 * guessed at, because a number nobody confirmed would sit on the ledger looking like
 * a fact.
 *
 * It returns the sentence rather than painting it: the screen's status line is the
 * design's one line of prose (the artboard's hint, `role="status"`), and the flow's
 * answer belongs there whether it is a refusal or a receipt.
 *
 * A scanned row's id is the payee's own address plus the amount, so scanning the same
 * code twice is the same row rather than a second one — `appendToLedger` skips it by
 * id, and this says so in words instead of silently doing nothing.
 */

import { appendToLedger } from "@/lib/ledger"
import type { Row } from "@/lib/types"
import type { UpiPayee } from "./upi"

/** Log a read payee, and answer with the sentence the screen should show. */
export function logScannedPayee(payee: UpiPayee): string {
  if (payee.amountCents === null) {
    return `${payee.pn} has no amount in its code, and nothing here asks for one yet. Scan one that carries the amount, or log the row by hand.`
  }

  const row: Row = {
    // The payee's own address is what makes a second scan of the same code the same
    // row rather than a second one.
    id: `upi-${payee.pa}-${payee.amountCents}`,
    title: payee.pn,
    category: "oneclick",
    account: "upi",
    amountCents: payee.amountCents,
    kind: "expense",
    at: Date.now(),
    // The VPA, because a payee's name alone would not say which address was paid.
    note: payee.pa,
    // Scanned money is the one row whose amount was confirmed against a payment the
    // owner was about to make, which is what `upi` marks.
    source: "upi",
  }

  const { added } = appendToLedger({ rows: [row] })
  return added > 0 ? `Logged ${payee.pn} — it is on the ledger now.` : `${payee.pn} was already logged.`
}
