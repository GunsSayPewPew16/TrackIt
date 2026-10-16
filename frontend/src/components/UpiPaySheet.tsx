import { useMemo, useState } from 'react'
import { formatMoney, parseAmountToCents } from '../lib/format'
import { CATEGORY_GROUPS, categoryFor, DEFAULT_CATEGORY } from '../lib/types'
import { buildGooglePayUri, buildUpiUri, canHandOffToUpiApp, type UpiPayee } from '../lib/upi'
import styles from './scan.module.css'

/**
 * The sheet that opens on a scanned payee.
 *
 * Two things happen on one tap, in this order and for a reason: the expense is
 * **logged first**, and only then is the payment handed to **Google Pay**. The
 * order matters because the handoff is one-way — the app that opens tells this
 * one nothing about what was paid — so a record written afterwards would be a
 * record that a crash, a back-swipe or a cancelled payment could lose. A logged
 * expense the owner decided not to pay is a row they can delete; a payment with
 * no row is the thing this app exists to prevent.
 *
 * Google Pay is named rather than left to the scheme, because a bare `upi://`
 * link is claimed by whichever app last took the scheme — on this owner's
 * iPhone that was WhatsApp, offering a payment screen for an account they do
 * not pay from. The generic link is not thrown away, though: it stays under the
 * button for the times the named app is not the one they want.
 */

type Props = {
  payee: UpiPayee
  currency: string
  /** Persist the expense. Resolves once the row is written. */
  onPay: (draft: { amountCents: number; category: string; note: string }) => Promise<void>
  /** Leave without paying: nothing is logged and nothing is handed off. */
  onCancel: () => void
}

/**
 * A first guess at the category, from the merchant's own name.
 *
 * Only ever a guess, and only ever a starting point: the select is right there
 * and the owner's answer always wins. The keywords are the ones that actually
 * appear in Indian UPI payee names.
 */
const CATEGORY_HINTS: [RegExp, string][] = [
  [/swiggy|zomato|dominos|domino|pizza|burger|kfc|mcdonald|restaurant|cafe|coffee|kitchen|dhaba|biryani|bakery|juice|chai|food/i, 'restaurant'],
  [/blinkit|zepto|instamart|bigbasket|jiomart|dmart|mart|supermarket|grocer|kirana|provision|vegetab|fruit|dairy|milk/i, 'groceries'],
  [/pharma|medic|chemist|drug|apollo|hospital|clinic|health|diagnostic/i, 'drug-store'],
  [/fuel|petrol|diesel|filling|indianoil|bharat petro|hp pay|shell/i, 'fuel'],
  [/uber|ola|rapido|cab|taxi|auto\b|ride|namma/i, 'taxi'],
  [/metro|irctc|rail|bus\b|transit|transport|redbus/i, 'public-transport'],
  [/recharge|airtel|jio\b|vodafone|\bvi\b|bsnl|prepaid|postpaid|mobile/i, 'mobile-recharge'],
  [/electric|power|water|gas\b|broadband|fiber|utility|utilities|bescom|mahanagar/i, 'energy'],
  [/bookmyshow|pvr|inox|cine|movie|cinema|theatre|entertain|game|playo/i, 'culture-sport'],
  [/salon|spa\b|beauty|barber|wellness|fitness|cult\.?fit/i, 'wellness'],
  [/stationer|print|copy|xerox|tool|hardware/i, 'stationery'],
  [/hotel|travel|trip|tour|flight|airline|indigo|makemytrip|oyo/i, 'holiday-trips'],
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
 * `Unknown` is Wallet's own plumbing envelope and hangs under no group, but it
 * is what this sheet falls back to when the merchant's name gives the category
 * away to nothing — so it is offered here explicitly. A `<select>` whose value
 * matches none of its options does not show that value: the browser displays
 * the *first* option instead, which is how a payment used to be shown as
 * "Food & Drinks" and filed under "Unknown" at the same time.
 */
const SELECT_GROUPS = [
  ...CATEGORY_GROUPS.map((group) => ({
    label: group.label,
    options: group.categories.map((id) => ({ id, label: categoryFor(id).label })),
  })),
  {
    label: 'Other',
    options: [{ id: DEFAULT_CATEGORY, label: categoryFor(DEFAULT_CATEGORY).label }],
  },
]

export function UpiPaySheet({ payee, currency, onPay, onCancel }: Props) {
  const [amount, setAmount] = useState(
    // A merchant's code often carries the amount it wants; prefill it rather
    // than making the owner type a number they were just shown.
    payee.amountCents === null ? '' : (payee.amountCents / 100).toFixed(2),
  )
  const [category, setCategory] = useState(() => guessCategory(payee))
  // The note is the owner's own words about what this payment was, so it starts
  // **empty**: the payee's name belongs on the card above, never in a note, and a
  // note rides along to the merchant inside the payment link. A merchant's code
  // may carry a note of its own, but that is their words about their shop rather
  // than the owner's about this payment, so it is not pre-filled either.
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logged, setLogged] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const cents = useMemo(() => {
    const parsed = parseAmountToCents(amount)
    return parsed && parsed > 0 ? parsed : null
  }, [amount])

  const handoffPossible = useMemo(() => canHandOffToUpiApp(), [])

  async function handlePay(event: React.FormEvent) {
    event.preventDefault()
    if (!cents) {
      setError('Enter the amount you are paying first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const trimmed = note.trim()
      await onPay({ amountCents: cents, category, note: trimmed })
      setLogged(true)

      // The link the phone's UPI apps understand. Built from what the owner
      // just confirmed, not from the code: the amount is theirs to set.
      const payment = { pa: payee.pa, pn: payee.pn, amountCents: cents, note: trimmed }
      // What stays on screen is the generic link, which any UPI app can take;
      // a `gpay://` link shown to someone without Google Pay would help nobody.
      setLink(buildUpiUri(payment, currency))
      // A scripted assignment, as the owner asked. It is a user gesture — the
      // tap that got here — so iOS and Android both honour it; where nothing
      // answers it, the sheet stays open with the link and the UPI ID below.
      window.location.href = buildGooglePayUri(payment, currency)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The expense could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function copyUpiId() {
    try {
      await navigator.clipboard.writeText(payee.pa)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className={styles.overlay} aria-label="Pay and log">
      <div className={styles.head}>
        <button type="button" className={styles.back} onClick={onCancel} aria-label="Close without paying">
          <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
        </button>
        <h1 className={styles.heading}>{logged ? 'Logged — pay in Google Pay' : 'Confirm and pay'}</h1>
      </div>

      {/* The payee, exactly as the code described them. */}
      <div className={styles.payee}>
        <span className={styles.payeeMark} aria-hidden>
          <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M3 9h18l-1.5 10.5a1.5 1.5 0 0 1-1.5 1.3H6a1.5 1.5 0 0 1-1.5-1.3z" />
            <path d="M8 9V6.5a4 4 0 0 1 8 0V9" />
          </svg>
        </span>
        <span className={styles.payeeText}>
          <span className={styles.payeeName}>{payee.pn}</span>
          <span className={styles.payeeId}>{payee.pa}</span>
        </span>
      </div>

      {logged ? (
        <>
          <p className={styles.logged}>
            <svg fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
              <path d="m4 12.5 5 5L20 6.5" />
            </svg>
            {cents ? formatMoney(cents, currency) : ''} logged to {categoryFor(category).label}.
          </p>

          <div className={styles.fallback}>
            <p className={styles.notice}>
              {handoffPossible
                ? 'If Google Pay did not open, use the link below — it opens whichever UPI app you have — or pay by UPI ID.'
                : 'This device has no UPI app, so the payment has to be made on your phone. The expense is logged.'}
            </p>
            {link && (
              <a className={styles.fallbackLink} href={link}>
                {link}
              </a>
            )}
            <button type="button" className={styles.secondary} onClick={copyUpiId}>
              {copied ? 'UPI ID copied' : `Copy UPI ID (${payee.pa})`}
            </button>
          </div>

          <button type="button" className={styles.primary} onClick={onCancel}>
            Done
          </button>
        </>
      ) : (
        <form className={styles.field} onSubmit={handlePay}>
          <div className={styles.amount}>
            <span className={styles.amountSymbol} aria-hidden>
              ₹
            </span>
            <input
              className={styles.amountInput}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              // `decimal` because the amount is money; both phones then show a
              // keypad with a separator instead of a full keyboard.
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Amount"
            />
          </div>

          <label className={styles.fieldLabel} htmlFor="pay-category">
            Category
          </label>
          <select
            id="pay-category"
            className={styles.select}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
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

          <label className={styles.fieldLabel} htmlFor="pay-note">
            Note
          </label>
          <input
            id="pay-note"
            className={styles.note}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What was this for?"
            maxLength={80}
          />

          {error && (
            <p className={`${styles.notice} ${styles.error}`} role="alert">
              {error}
            </p>
          )}

          <p className={styles.notice}>
            The expense is logged first, then Google Pay opens for the payment.
            Paying is what makes the two agree.
          </p>

          <button type="submit" className={styles.primary} disabled={busy}>
            {busy ? 'Logging…' : 'Pay & log expense'}
          </button>
        </form>
      )}
    </section>
  )
}
