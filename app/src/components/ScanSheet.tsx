import { useCallback, useState } from "react"

import { QrScanner } from "@/features/upi/QrScanner"
import type { UpiPayee } from "@/features/upi/upi"
import { appendToLedger } from "@/lib/ledger"
import type { Row } from "@/lib/types"

/**
 * What the dashboard's Scan card does today.
 *
 * The design draws a camera in the corner of the bento and the owner asked for the
 * UPI scanner to survive the redesign, so this is the smallest honest way to join
 * them: the card opens the app's own scanner, and a code that already carries an
 * amount logs a row under **Wallet - OneClick record** — the same category the
 * previous app filed a scanned payment under, and the reason that category exists.
 *
 * It is deliberately not a payment. Nothing here hands a `upi://` link to another
 * app, and a code with no amount in it says so instead of guessing one, because the
 * pay sheet that would ask for the amount is a screen this design does not have yet
 * — `features/upi/` holds the scanner and the link builder for when it does.
 */
export function ScanSheet({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState<string | null>(null)

  const handlePayee = useCallback((payee: UpiPayee) => {
    if (payee.amountCents === null) {
      setReport(
        `${payee.pn} has no amount in its code, and nothing here asks for one yet. Scan one that carries the amount, or log the row by hand.`,
      )
      return
    }
    const row: Row = {
      // The payee's own address is what makes a second scan of the same code the
      // same row rather than a second one.
      id: `upi-${payee.pa}-${payee.amountCents}`,
      title: payee.pn,
      category: "oneclick",
      account: "upi",
      amountCents: payee.amountCents,
      kind: "expense",
      at: Date.now(),
      note: payee.pa,
      // Scanned money is the one row whose amount was confirmed against a payment
      // the owner was about to make, which is what `upi` marks.
      source: "upi",
    }
    const { added } = appendToLedger({ rows: [row] })
    setReport(
      added > 0 ? `Logged ${payee.pn} — it is on the ledger now.` : `${payee.pn} was already logged.`,
    )
  }, [])

  return (
    <>
      <QrScanner onPayee={handlePayee} onCancel={onClose} />
      {report && (
        <p
          role="status"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[390px] rounded-t-[20px] bg-card p-4 text-ink"
        >
          {report}
        </p>
      )}
    </>
  )
}
