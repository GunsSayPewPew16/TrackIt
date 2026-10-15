import { useState } from "react"
import { ArrowLeft, Check, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { buildUpiUri, type UpiPayee } from "@/lib/upi"

export type PaySubmit = { amountCents: number; category: string; note: string }

type Props = {
  payee: UpiPayee
  /** The category the merchant's name suggested. The owner's pick always wins. */
  initialCategory: string
  categories: { id: string; label: string }[]
  /** Log the expense. Runs before any payment handoff, so a row is never missing. */
  onPay: (draft: PaySubmit) => void
  onClose: () => void
}

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
  const [note, setNote] = useState(payee.note || payee.pn)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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
    // before anything leaves this page.
    onPay({ amountCents: cents, category, note: trimmed })
    setLink(buildUpiUri({ pa: payee.pa, pn: payee.pn, amountCents: cents, note: trimmed }))
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
        <h2 className="text-2xl font-bold tracking-tight">
          {link ? "Logged. Pay next." : "Confirm and pay"}
        </h2>
      </div>

      <div className="flex items-center gap-3 rounded-[24px] border border-ink/10 bg-paper p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-tangerine text-ink">
          <Check className="size-4" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">{payee.pn}</span>
          <span className="truncate font-mono text-[11px] tracking-wide opacity-70">{payee.pa}</span>
        </div>
      </div>

      {link ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {amount ? `₹${amount}` : ""} logged to {categoryLabel}.
          </p>
          <p className="text-sm text-ink/70">
            Pay it in any UPI app. Google Pay, the UPI link and the UPI ID are all below.
          </p>
          <a
            href={link}
            className="break-all rounded-[16px] border border-ink/10 bg-paper p-3 font-mono text-[11px] text-ink"
          >
            {link}
          </a>
          <Button variant="outline" onClick={copyUpiId} className="h-11">
            <Copy />
            {copied ? "UPI ID copied" : `Copy UPI ID (${payee.pa})`}
          </Button>
          <Button variant="default" onClick={onClose} className="h-12">
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex items-baseline gap-1 rounded-[24px] border border-ink/10 bg-paper px-5 py-4">
            <span className="text-3xl font-bold" aria-hidden="true">₹</span>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Amount"
              className="min-w-0 flex-1 bg-transparent text-4xl font-bold tracking-tight tabular-nums outline-none placeholder:text-ink/30"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="pay-category" className="font-mono text-[11px] tracking-wide uppercase">
              Category
            </label>
            <select
              id="pay-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-11 rounded-full border border-ink/10 bg-paper px-4 text-sm outline-none focus-visible:outline-2 focus-visible:outline-ink"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="pay-note" className="font-mono text-[11px] tracking-wide uppercase">
              Note
            </label>
            <input
              id="pay-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What was this for?"
              maxLength={80}
              className="h-11 rounded-full border border-ink/10 bg-paper px-4 text-sm outline-none focus-visible:outline-2 focus-visible:outline-ink"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm font-semibold text-tangerine">
              {error}
            </p>
          )}

          <p className="text-sm text-ink/60">
            The expense is logged first, then the payment link is shown to pay with. Paying is what makes the two agree.
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
