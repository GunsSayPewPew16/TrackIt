import { useMemo, useState } from "react"
import { ArrowLeft, Check, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { buildGooglePayUri, buildUpiUri, canHandOffToUpiApp, type UpiPayee } from "@/lib/upi"

export type PaySubmit = { amountCents: number; category: string; note: string }

type Props = {
  payee: UpiPayee
  /** The category the merchant's name suggested. The owner's pick always wins. */
  initialCategory: string
  categories: { id: string; label: string }[]
  /**
   * Log the expense and remember who the payment went to. Runs before any payment
   * handoff, so a row is never missing.
   */
  onPay: (draft: PaySubmit, handedTo: string) => void
  onClose: () => void
}

/**
 * The sheet that opens on a scanned payee.
 *
 * "Pay and log" does two things in one tap, in this order and for a reason: the
 * expense is **logged first**, then the payment is handed to **Google Pay**. The
 * order matters because the handoff is one-way — the app that opens tells this
 * page nothing about what was paid — so a record written afterwards is a record a
 * crash or a cancelled payment could lose. A logged expense the owner decided not
 * to pay is a row they can delete; a payment with no row is the thing this site
 * exists to prevent.
 *
 * Google Pay is named rather than left to the scheme, because a bare `upi://`
 * link is claimed by whichever app last took the scheme — on the owner's phone
 * that was WhatsApp, offering a payment screen for an account they do not pay
 * from. The generic link is not thrown away: it stays below the button, labelled,
 * for the times the named app is not the one they want.
 */

/** Rupees typed by the owner ("₹1,240.50") into integer paise, or null. */
function parseAmountToCents(raw: string): number | null {
  const value = Number(raw.replace(/[₹,\s]/g, ""))
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
}

export function UpiPaySheet({ payee, initialCategory, categories, onPay, onClose }: Props) {
  const [amount, setAmount] = useState(
    payee.amountCents === null ? "" : (payee.amountCents / 100).toFixed(2),
  )
  const [category, setCategory] = useState(initialCategory)
  // The note is the owner's own words about what this payment was, so it starts
  // **empty**: nothing is filled in from the payee, and that includes their name,
  // which is the payee card's job to show and never a note. (A merchant's code may
  // carry a note of its own; it is their words about their shop, not the owner's
  // about this payment, and pre-filling it only invites sending it back to them.)
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  // Set once the expense is logged: the link that names Google Pay and the
  // generic one. Both are built from what the owner confirmed, never from the
  // code, because the amount is theirs to set.
  const [offer, setOffer] = useState<{ anyApp: string; googlePay: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const handoffPossible = useMemo(() => canHandOffToUpiApp(), [])

  function openGooglePay() {
    if (handoffPossible && offer) window.location.href = offer.googlePay
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const cents = parseAmountToCents(amount)
    if (!cents) {
      setError("Enter the amount you are paying first.")
      return
    }
    setError(null)
    const trimmed = note.trim()
    // Log first: the handoff to a UPI app is one-way, so the row must exist
    // before anything leaves this page — and it says which app it went to, because
    // a laptop handed nothing over and must not claim otherwise.
    onPay({ amountCents: cents, category, note: trimmed }, handoffPossible ? "Google Pay" : "UPI link")
    const payment = { pa: payee.pa, pn: payee.pn, amountCents: cents, note: trimmed }
    const googlePay = buildGooglePayUri(payment)
    setOffer({ anyApp: buildUpiUri(payment), googlePay })
    // Straight into Google Pay, in the same tap that got here: nothing is awaited
    // before this assignment, because iOS only honours a handoff set while the
    // gesture is still open. Where nothing answers it — a laptop, or a phone
    // without Google Pay — this sheet stays exactly where it is, with the
    // fallback link and the UPI ID on it.
    if (handoffPossible) window.location.href = googlePay
  }

  async function copyUpiId() {
    try {
      await navigator.clipboard.writeText(payee.pa)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const categoryLabel = categories.find((c) => c.id === category)?.label ?? category

  return (
    <section aria-label="Confirm and pay" className="fixed inset-0 z-50 overflow-y-auto bg-canvas">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 py-8">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close without paying">
          <ArrowLeft />
        </Button>
        <h2 className="font-display text-2xl font-bold tracking-tight">
          {offer ? "Logged. Pay next." : "Confirm and pay"}
        </h2>
      </div>

      <div className="flex items-center gap-3 rounded-[24px] border border-ink/10 bg-card p-4 text-ink">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-tangerine text-ink">
          <Check className="size-4" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{payee.pn}</span>
          <span className="truncate text-[11px] tracking-wide opacity-75">{payee.pa}</span>
        </div>
      </div>

      {offer ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {amount ? `₹${amount}` : ""} logged to {categoryLabel}.
          </p>
          <p className="text-sm text-on-canvas/70">
            {handoffPossible
              ? "Google Pay should have opened. If it did not, open it below — the payment itself is the one thing this site cannot do for you."
              : "This device cannot open a UPI app, so the payment has to be made on your phone. The expense is logged."}
          </p>
          {handoffPossible && (
            <Button variant="accent" onClick={openGooglePay} className="h-12">
              Open Google Pay
            </Button>
          )}
          <Button variant="outline" onClick={copyUpiId} className="h-11">
            <Copy />
            {copied ? "UPI ID copied" : `Copy UPI ID (${payee.pa})`}
          </Button>
          <p className="text-[11px] font-medium tracking-wide uppercase opacity-70">
            Any other UPI app
          </p>
          <a
            href={offer.anyApp}
            className="break-all rounded-[16px] border border-ink/10 bg-card p-3 text-[11px] text-ink"
          >
            {offer.anyApp}
          </a>
          <Button variant="default" onClick={onClose} className="h-12">
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex items-baseline gap-1 rounded-[24px] border border-ink/10 bg-card px-5 py-4 text-ink">
            <span className="text-3xl font-bold" aria-hidden="true">₹</span>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Amount"
              className="min-w-0 flex-1 bg-transparent text-4xl font-bold tracking-tight tabular-nums outline-none placeholder:text-ink/55"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="pay-category" className="text-[11px] font-medium tracking-wide uppercase">
              Category
            </label>
            <select
              id="pay-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-11 rounded-full border border-ink/10 bg-card px-4 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-ink"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="pay-note" className="text-[11px] font-medium tracking-wide uppercase">
              Note
            </label>
            <input
              id="pay-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What was this for?"
              maxLength={80}
              className="h-11 rounded-full border border-ink/10 bg-card px-4 text-sm text-ink outline-none placeholder:text-ink/55 focus-visible:outline-2 focus-visible:outline-ink"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm font-medium text-alert">
              {error}
            </p>
          )}

          <p className="text-sm text-on-canvas/70">
            The expense is logged first, then Google Pay opens for the payment. Paying is what makes the two agree.
          </p>

          <Button type="submit" variant="accent" className="h-12">
            Pay and log expense
          </Button>
        </form>
      )}
      </div>
    </section>
  )
}
