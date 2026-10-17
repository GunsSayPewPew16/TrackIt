/**
 * The money screen: what a scanned code with no amount opens.
 *
 * A merchant's QR code may carry the amount it wants (`am`), and when it does there is
 * nothing to ask — `features/upi/logScan.ts` logs the row and the scanner says so. Most
 * codes do not, and this is the screen for those: the amount the owner is about to pay,
 * the category it is filed under, and a note in their own words.
 *
 * **It is the retired app's pay sheet, brought back.** That app's `UpiPaySheet.tsx` was the
 * last thing to do this, and it is the shape the owner asked to keep — the payee as the code
 * described them, the amount above everything, a category guessed from the merchant's name,
 * then **logged first and handed to the payment app second**, in that order and for a
 * reason: the handoff is one-way, so a row written afterwards is a row a crash, a
 * back-swipe or a cancelled payment can lose. A logged expense the owner decided not to pay
 * is a row they can delete; a payment with no row is the thing this app exists to prevent.
 * The owner is restyling this screen themselves, so what is here is that screen's structure
 * and wording in this app's tokens rather than a new design for it.
 *
 * **Two changes from the old file, both deliberate.** The row is written **synchronously**
 * (`appendToLedger` writes to the device's own storage), so there is no "Logging…" state
 * and no failure to report — the old sheet awaited a network save. And the handoff happens
 * **only where there is something to hand off to** (`canHandOffToUpiApp`: a phone): the old
 * sheet assigned the link on a desktop too, where the generic `upi://` link is a scheme
 * nothing claims, and where its own notice already says the payment has to be made on the
 * phone.
 *
 * Google Pay is named rather than left to the scheme, for the reason `features/upi/upi.ts`
 * sets out: a bare `upi://` link belongs to whichever app last asked for it. The generic
 * link is not thrown away — it is what the screen shows under the button, for the times the
 * named app is not the one the owner wants, and on every device that cannot open either.
 */

import { ArrowLeft, Check, Wallet } from "lucide-react"
import { useMemo, useState } from "react"

import type { PaidDraft } from "@/features/upi/logScan"
import {
  buildGooglePayUri,
  buildUpiUri,
  canHandOffToUpiApp,
  type UpiPayee,
  type UpiPayment,
} from "@/features/upi/upi"
import { CATEGORY_GROUPS, categoryFor, DEFAULT_CATEGORY } from "@/lib/categories"
import { DEFAULT_CURRENCY, money, parseAmountToCents } from "@/lib/format"

type Props = {
  /** The payee exactly as the code described them. */
  payee: UpiPayee
  /** Write the row, and answer with the sentence the scanner's status line will show. */
  onPay: (draft: PaidDraft) => string
  /** Leave: the screen closes, and whatever `onPay` said (if anything) is left standing. */
  onClose: () => void
}

/**
 * A first guess at the category, from the merchant's own name.
 *
 * Only ever a guess, and only ever a starting point: the select is right there and the
 * owner's answer always wins. The keywords are the ones that actually appear in Indian UPI
 * payee names, and every category id here is one `lib/categories.ts` carries.
 */
const CATEGORY_HINTS: [RegExp, string][] = [
  [/swiggy|zomato|dominos|domino|pizza|burger|kfc|mcdonald|restaurant|cafe|coffee|kitchen|dhaba|biryani|bakery|juice|chai|food/i, "restaurant"],
  [/blinkit|zepto|instamart|bigbasket|jiomart|dmart|mart|supermarket|grocer|kirana|provision|vegetab|fruit|dairy|milk/i, "groceries"],
  [/pharma|medic|chemist|drug|apollo|hospital|clinic|health|diagnostic/i, "drug-store"],
  [/fuel|petrol|diesel|filling|indianoil|bharat petro|hp pay|shell/i, "fuel"],
  [/uber|ola|rapido|cab|taxi|auto\b|ride|namma/i, "taxi"],
  [/metro|irctc|rail|bus\b|transit|transport|redbus/i, "public-transport"],
  [/recharge|airtel|jio\b|vodafone|\bvi\b|bsnl|prepaid|postpaid|mobile/i, "mobile-recharge"],
  [/electric|power|water|gas\b|broadband|fiber|utility|utilities|bescom|mahanagar/i, "energy"],
  [/bookmyshow|pvr|inox|cine|movie|cinema|theatre|entertain|game|playo/i, "culture-sport"],
  [/salon|spa\b|beauty|barber|wellness|fitness|cult\.?fit/i, "wellness"],
  [/stationer|print|copy|xerox|tool|hardware/i, "stationery"],
  [/hotel|travel|trip|tour|flight|airline|indigo|makemytrip|oyo/i, "holiday-trips"],
]

function guessCategory(payee: UpiPayee): string {
  const haystack = `${payee.pn} ${payee.pa}`
  for (const [pattern, category] of CATEGORY_HINTS) {
    if (pattern.test(haystack)) return category
  }
  return DEFAULT_CATEGORY
}

/**
 * The categories the owner may pick, in the groups the app already walks.
 *
 * `Unknown` hangs under no group of its own, but it is what this screen falls back to when
 * the merchant's name gives the category away to nothing — so it is offered explicitly. A
 * `<select>` whose value matches none of its options does not show that value: the browser
 * displays the *first* option instead, which is how a payment used to be shown as
 * "Food & Drinks" and filed under "Unknown" at the same time.
 */
const SELECT_GROUPS = [
  ...CATEGORY_GROUPS.map((group) => ({
    label: group.label,
    options: group.categories.map((id) => ({ id, label: categoryFor(id).label })),
  })),
  { label: "Other", options: [{ id: DEFAULT_CATEGORY, label: categoryFor(DEFAULT_CATEGORY).label }] },
]

/** The app's own small letterspaced label, which every chip and field caption wears. */
const FIELD_LABEL = "block text-[10px] leading-4 font-bold tracking-[0.03em] text-ink2"

export function PaySheet({ payee, onPay, onClose }: Props) {
  const [amount, setAmount] = useState(
    // A code that did carry an amount is prefilled rather than typed again — the scanner
    // only opens this screen for codes that do not, so this is for whatever calls it next.
    payee.amountCents === null ? "" : (payee.amountCents / 100).toFixed(2),
  )
  const [category, setCategory] = useState(() => guessCategory(payee))
  // The note is the owner's own words about this payment, so it starts **empty**: the
  // payee's name belongs on the card above, and a note rides along to the merchant inside
  // the payment link.
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  /** What `onPay` answered, and what the screen shows once the row is written. */
  const [receipt, setReceipt] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const cents = useMemo(() => {
    const parsed = parseAmountToCents(amount)
    return parsed !== null && parsed > 0 ? parsed : null
  }, [amount])

  const handoff = useMemo(() => canHandOffToUpiApp(), [])

  function handlePay(event: React.FormEvent) {
    event.preventDefault()
    if (cents === null) {
      setError("Enter the amount you are paying first.")
      return
    }
    setError(null)
    const trimmed = note.trim()

    // Logged first, and synchronously: if this throws, nothing is handed off, which is the
    // right way round — see the note at the top of this file.
    setReceipt(onPay({ amountCents: cents, category, note: trimmed }))

    // The link the phone's UPI apps understand, built from what the owner just confirmed
    // rather than from the code: the amount is theirs to set.
    const payment: UpiPayment = { pa: payee.pa, pn: payee.pn, amountCents: cents, note: trimmed }
    setLink(buildUpiUri(payment, DEFAULT_CURRENCY))
    if (handoff) window.location.href = buildGooglePayUri(payment, DEFAULT_CURRENCY)
  }

  async function copyUpiId() {
    try {
      await navigator.clipboard.writeText(payee.pa)
      setCopied(true)
    } catch {
      // A browser that refuses the clipboard still has the address on screen to copy.
      setCopied(false)
    }
  }

  return (
    <section className="fixed inset-0 z-50 overflow-y-auto bg-canvas text-ink" aria-label="Pay and log">
      {/* Full screen, so it needs the notch's clearance for its own header too. */}
      <div className="mx-auto w-full max-w-[390px] px-4 pt-safe pb-8">
        <header className="flex h-12 items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close without paying"
            className="flex size-12 shrink-0 items-center justify-center rounded-3xl border border-line bg-card text-ink"
          >
            <ArrowLeft className="size-6" strokeWidth={1.5} aria-hidden="true" />
          </button>
          <h1 className="font-display text-base leading-6 font-medium tracking-[-0.01em]">
            {receipt === null ? "Confirm and pay" : "Logged — pay in Google Pay"}
          </h1>
        </header>

        {/* The payee, exactly as the code described them. */}
        <div className="mt-6 flex items-center gap-3 rounded-[20px] border border-line bg-card p-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-3xl bg-sage text-on-sage">
            <Wallet className="size-6" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-display text-[14px] leading-5 font-medium tracking-[-0.01em]">{payee.pn}</span>
            <span className="truncate text-[12px] leading-4 text-ink2">{payee.pa}</span>
          </span>
        </div>

        {receipt === null ? (
          <form onSubmit={handlePay}>
            <label htmlFor="pay-amount" className={`mt-6 ${FIELD_LABEL}`}>
              AMOUNT
            </label>
            <div className="mt-2 flex items-center gap-2 rounded-[20px] border border-line bg-card px-4 py-3">
              <span className="font-display text-[28px] leading-9 text-ink2" aria-hidden="true">
                ₹
              </span>
              <input
                id="pay-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                // `decimal` because the amount is money: both phones then show a keypad
                // with a separator instead of the whole keyboard.
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                aria-label="Amount"
                className="w-full border-0 bg-transparent font-display text-[28px] leading-9 font-medium tracking-[-0.02em] text-ink outline-none placeholder:text-ink2"
              />
            </div>

            <label htmlFor="pay-category" className={`mt-6 ${FIELD_LABEL}`}>
              CATEGORY
            </label>
            <select
              id="pay-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="mt-2 h-12 w-full rounded-[16px] border border-line bg-card px-4 text-[13px] leading-4 text-ink"
            >
              {SELECT_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <label htmlFor="pay-note" className={`mt-6 ${FIELD_LABEL}`}>
              NOTE
            </label>
            <input
              id="pay-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What was this for?"
              maxLength={80}
              className="mt-2 h-12 w-full rounded-[16px] border border-line bg-card px-4 text-[13px] leading-4 text-ink placeholder:text-ink2"
            />

            {error !== null && (
              <p className="mt-4 text-[13px] leading-5 text-clay" role="alert">
                {error}
              </p>
            )}

            <p className="mt-4 text-[12px] leading-5 text-ink2">
              The expense is logged first, then Google Pay opens for the payment. Paying is what makes the two agree.
            </p>

            <button
              type="submit"
              className="mt-4 flex h-12 w-full items-center justify-center rounded-[16px] border-0 bg-clay px-4 text-[13px] leading-4 font-bold text-on-clay"
            >
              Pay &amp; log expense
            </button>
          </form>
        ) : (
          <>
            <p className="mt-6 flex items-center gap-2 text-[13px] leading-5 text-ink" role="status">
              <Check className="size-4 shrink-0 text-sage" strokeWidth={2.5} aria-hidden="true" />
              {money(cents ?? 0)} logged to {categoryFor(category).label}. {receipt}
            </p>

            <div className="mt-6 rounded-[20px] border border-line bg-card p-4">
              <p className="text-[12px] leading-5 text-ink2">
                {handoff
                  ? "If Google Pay did not open, use the link below — it opens whichever UPI app you have — or pay by UPI ID."
                  : "This device has no UPI app, so the payment has to be made on your phone. The expense is logged."}
              </p>
              {link !== null && (
                <a href={link} className="mt-2 block truncate text-[12px] leading-5 break-all text-clay">
                  {link}
                </a>
              )}
              <button
                type="button"
                onClick={copyUpiId}
                className="mt-4 flex h-12 w-full items-center justify-center rounded-[16px] border border-line bg-canvas px-4 text-[13px] leading-4 font-bold text-ink"
              >
                {copied ? "UPI ID copied" : `Copy UPI ID (${payee.pa})`}
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-4 flex h-12 w-full items-center justify-center rounded-[16px] border-0 bg-clay px-4 text-[13px] leading-4 font-bold text-on-clay"
            >
              Done
            </button>
          </>
        )}
      </div>
    </section>
  )
}
