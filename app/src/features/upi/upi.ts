/**
 * UPI links, in both directions.
 *
 * A merchant's QR code is a `upi://pay?…` string, and paying is handing a link
 * of the same shape back to whichever UPI app the phone has. The codes in the
 * wild are written by many different apps, so this module is deliberately
 * tolerant about what it *reads* and strict about what it *writes*:
 *
 * - Anything without a payee address (`pa`) is refused, with a reason the UI can
 *   say out loud — a Wi-Fi code or a website QR must not look like a payment.
 * - Everything this module writes is percent-encoded exactly once, by hand
 *   rather than through `URLSearchParams`, because that class encodes a space as
 *   `+` (an `application/x-www-form-urlencoded` convention). A `+` inside a
 *   payee name or a note is a character, not a space, once the UPI app reads it.
 * - The VPA's `@` is left literal. `%40` is legal and decodes to the same address, but UPI
 *   apps parse these links by hand and a literal `@` is what every code in the wild carries;
 *   writing `pa=shop@okaxis` keeps this module's links in that same spelling.
 * - **A merchant code is forwarded, not flattened.** A scanned code's `mc`, `tr`, `tid`,
 *   `sign` and `url` are merchant context, and dropping them turns a merchant payment into
 *   an ordinary transfer to the same VPA — which is how a valid payee ends up refused. They
 *   are carried through `extra` and written back unchanged (see `UpiPayee.extra`).
 *
 * Nothing here touches the network: it is string work, which is why it can be
 * tested without a camera and why the manual-entry path in the scanner runs
 * through exactly the same code as the camera does.
 */

/** A payee read out of a QR code (or typed in by hand). */
export type UpiPayee = {
  /** Payee address, the VPA: `name@bank`. */
  pa: string
  /** The merchant's own name for itself, `pn`. */
  pn: string
  /** Paise, when the code itself carried an amount (`am`); `null` otherwise. */
  amountCents: number | null
  /** The note the code carried (`tn`), if any. */
  note: string
  /**
   * The code's merchant fields — `mc`, `tr`, `mode`, `orgid`, `sign`, `url` and whatever
   * else it carried — kept verbatim so a payment handed back to a UPI app is the same
   * merchant payment the QR described. A merchant VPA asked to pay as a plain transfer can
   * be refused even though the address is correct; Google Pay's Android sample carries
   * `mc`, `tr` and `url` for exactly this reason. The five fields this app re-states
   * (`pa`, `pn`, `am`, `cu`, `tn`) are left out.
   */
  extra: Record<string, string>
}

export type UpiParseError =
  /** The code holds no UPI payment at all. */
  | 'not-upi'
  /** A UPI payment with no payee address in it. */
  | 'no-payee'
  /** A payee address that cannot be a VPA. */
  | 'bad-payee'

export type UpiParseResult =
  | { ok: true; payee: UpiPayee }
  | { ok: false; reason: UpiParseError }

/**
 * A VPA is `handle@psp`: the handle allows letters, digits, dot, dash and
 * underscore, the PSP part is a domain-ish name. Deliberately not stricter than
 * that — banks hand out odd handles, and refusing a real VPA is worse than
 * accepting a malformed one, which the UPI app will refuse anyway.
 */
const VPA = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}@[A-Za-z][A-Za-z0-9.]{1,31}$/

/** Percent-decoding that never throws: a stray `%` must not break a scan. */
function decode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * The parameters of a UPI link, read by hand.
 *
 * `URLSearchParams` is not used here for the reason in this module's header:
 * it would turn every `+` into a space. Splitting on `&` and `=` and decoding
 * each side with `decodeURIComponent` is what the UPI app on the phone does.
 */
function readParams(query: string): Map<string, string> {
  const params = new Map<string, string>()
  for (const pair of query.split('&')) {
    if (!pair) continue
    const cut = pair.indexOf('=')
    const key = cut === -1 ? pair : pair.slice(0, cut)
    const value = cut === -1 ? '' : pair.slice(cut + 1)
    const name = decode(key).trim().toLowerCase()
    // First one wins: duplicated parameters are a malformed code, and the
    // first is what the UPI apps themselves take.
    if (name && !params.has(name)) params.set(name, decode(value).trim())
  }
  return params
}

/** Everything after the first `?`, whether or not there is a scheme before it. */
function queryOf(text: string): string | null {
  const cut = text.indexOf('?')
  if (cut !== -1) return text.slice(cut + 1)
  // Tolerates a bare parameter string, which is what a hand-typed
  // "pa=name@bank" is, and what some generators emit without any scheme.
  return text.includes('pa=') || text.includes('pn=') ? text : null
}

/** Rupees-with-decimals (`am=120.50`) into integer paise, or `null`. */
function amountToCents(raw: string): number | null {
  if (!raw) return null
  const rupees = Number.parseFloat(raw)
  if (!Number.isFinite(rupees) || rupees <= 0) return null
  // One rounding rule for the whole app: money is integer paise.
  return Math.round(rupees * 100)
}

/**
 * Read a payee out of whatever the camera saw.
 *
 * Accepts `upi://pay?…`, the same link with an `https://` scheme in front of it
 * (some generators wrap it), and a bare `pa=…&pn=…` string; refuses everything
 * else so a non-payment code cannot be mistaken for one.
 */
export function parseUpiCode(raw: string): UpiParseResult {
  const text = raw.trim()
  if (!text) return { ok: false, reason: 'not-upi' }

  const query = queryOf(text)
  if (query === null) return { ok: false, reason: 'not-upi' }

  const params = readParams(query)
  const payeeAddress = params.get('pa') ?? ''
  if (!payeeAddress) return { ok: false, reason: 'no-payee' }
  if (!VPA.test(payeeAddress)) return { ok: false, reason: 'bad-payee' }

  // Everything except the five fields this module rebuilds. A merchant code's `mc`, `tr`,
  // `mode`, `orgid` and `sign` are what make it a merchant payment; dropping them and
  // keeping only the VPA is how a valid merchant code becomes a refused payee.
  const reserved = new Set(['pa', 'pn', 'am', 'cu', 'tn'])
  const extra: Record<string, string> = {}
  for (const [key, value] of params) {
    if (!reserved.has(key)) extra[key] = value
  }

  return {
    ok: true,
    payee: {
      pa: payeeAddress,
      // A code with no `pn` still has a name worth showing: the handle is what
      // the owner will recognise anyway, so the form is never blank.
      pn: params.get('pn') || payeeAddress.split('@')[0],
      amountCents: amountToCents(params.get('am') ?? ''),
      note: params.get('tn') ?? '',
      extra,
    },
  }
}

/** Human copy for a refusal, so the scanner can say what went wrong. */
export const UPI_PARSE_MESSAGE: Record<UpiParseError, string> = {
  'not-upi': 'That code is not a UPI payment code.',
  'no-payee': 'That UPI code has no payee in it.',
  'bad-payee': 'That UPI code\u2019s payee address looks wrong.',
}

/** What this app hands to the UPI app: a payee, an amount, and a note. */
export type UpiPayment = {
  pa: string
  pn: string
  amountCents: number
  /** Free text for the UPI app's own note field (`tn`). */
  note?: string
  /** Defaults to the app's own currency. */
  currency?: string
  /**
   * Merchant fields from the scanned code (`mc`, `tr`, `mode`, `orgid`, `sign`, `url`…).
   * They are forwarded as they were read, except for the fields this module owns.
   */
  extra?: Record<string, string>
}

/** UPI's own note field is short; anything longer is truncated by the apps. */
const NOTE_LIMIT = 50

/** Percent-encode one parameter value. See this module's header for why by hand. */
const encode = (value: string): string => encodeURIComponent(value)

/**
 * Percent-encode a VPA, leaving its `@` literal.
 *
 * `encodeURIComponent('shop@okaxis')` is `shop%40okaxis`: valid, and decoded by any parser
 * that follows the URI rules. The literal form is still the one every UPI code prints, and a
 * query value may contain `@` unescaped, so this module writes the VPA the way the code it
 * came from did rather than asking each app's parser to be correct.
 */
const encodeVpa = (value: string): string => encode(value).replace(/%40/g, "@")

/**
 * The parameters of a payment link, in the order a human reads them: payee,
 * name, amount. `cu` is always sent, because without it some apps stop to ask.
 *
 * Every link this module writes is built here, so the generic link, the Google
 * Pay one and the QR code they came from can never disagree about the amount.
 */
function upiQuery(payment: UpiPayment, currency: string): string {
  const note = (payment.note ?? '').replace(/\s+/g, ' ').trim().slice(0, NOTE_LIMIT)
  const pairs: [string, string][] = [
    ['pa', payment.pa],
    ['pn', payment.pn || payment.pa],
    // Rupees with two decimals, as the spec's `am` wants: 20900 -> "209.00".
    ['am', (payment.amountCents / 100).toFixed(2)],
    ['cu', payment.currency ?? currency],
  ]
  if (note) pairs.push(['tn', note])
  /*
   * The scanned code's other fields, in its own order. The amount and payee are ours — the
   * owner confirmed them on the payment screen — but a merchant code's `mc`, `tr`, `mode`,
   * `orgid` and `sign` must survive the trip, or the app is asking Google Pay to pay a
   * merchant VPA as an ordinary person-to-person transfer.
   */
  const stated = new Set(['pa', 'pn', 'am', 'cu', 'tn'])
  for (const [key, value] of Object.entries(payment.extra ?? {})) {
    if (stated.has(key)) continue
    pairs.push([key, value])
  }
  return pairs
    .map(([key, value]) => `${key}=${key === 'pa' ? encodeVpa(value) : encode(value)}`)
    .join('&')
}

/**
 * The payment link handed to the phone's UPI apps.
 *
 * This is the link that belongs to no app in particular — what the QR code
 * itself asked for. It is what the payment screen shows under the button, so a
 * payee can still be paid when the named app is not the one the owner wants.
 */
export function buildUpiUri(payment: UpiPayment, currency = 'INR'): string {
  return `upi://pay?${upiQuery(payment, currency)}`
}

/**
 * Which phone this is, as far as the handoff cares.
 *
 * Only used to pick a link shape: the two phones do not agree on how a page
 * asks for one particular app, and iOS in particular cannot be told to use a
 * *package* at all, only a scheme.
 */
function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent)
}

/**
 * Whether this device can hand a payment to another app at all.
 *
 * A desktop browser cannot, and saying so up front is kinder than scanning a
 * code and then doing nothing. (iOS still decides per app whether it accepts
 * the link, which is why the payment screen keeps a visible fallback.)
 */
export function canHandOffToUpiApp(): boolean {
  return isIos() || isAndroid()
}

/**
 * Google Pay, by name, on both phones.
 *
 * A bare `upi://pay` link belongs to no app in particular: whichever one last
 * asked iOS or Android to own the scheme takes it, and on the owner's iPhone
 * that turned out to be WhatsApp — a payment screen, but the wrong one, with
 * none of the cards they actually pay from.
 *
 * Google publishes the two ways to name it:
 *
 * - **iOS** — `gpay://upi/pay?…`, the scheme Google's own iOS integration
 *   guide tells integrators to open. Custom schemes are first-come-first-served
 *   and iOS ignores duplicates, so `gpay` is the closest a page can get to
 *   "Google Pay" here; nothing on iOS can pin a bundle id from the web.
 * - **Android** — an `intent://` URL, which *can* name a package:
 *   `#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user`. If
 *   that package is not installed, Chrome opens the `S.browser_fallback_url`
 *   instead, which is this app itself — where the generic link and the payee's
 *   UPI ID are still on screen.
 */
const GOOGLE_PAY_SCHEME = 'gpay://upi/pay'
const GOOGLE_PAY_PACKAGE = 'com.google.android.apps.nbu.paisa.user'

/**
 * The link that opens **Google Pay** rather than whichever app claims `upi://`.
 *
 * Falls back to the generic link on anything that is neither phone: a desktop
 * has nothing to hand a payment to either way, and that link is also what the
 * payment screen shows under the button.
 */
export function buildGooglePayUri(payment: UpiPayment, currency = 'INR'): string {
  const query = upiQuery(payment, currency)
  if (isIos()) return `${GOOGLE_PAY_SCHEME}?${query}`
  if (isAndroid()) {
    // Where Chrome goes when Google Pay is not installed. Percent-encoded
    // whole, as the intent syntax requires of a fallback URL.
    const fallback = encodeURIComponent(`${location.origin}${location.pathname}`)
    return `intent://pay?${query}#Intent;scheme=upi;package=${GOOGLE_PAY_PACKAGE};S.browser_fallback_url=${fallback};end`
  }
  return buildUpiUri(payment, currency)
}

/**
 * Hand a confirmed payment to Google Pay, and cover the one case the link cannot.
 *
 * Android is already covered by the `intent://` fallback and a desktop has nothing to hand
 * the payment to, so both are one assignment. **iOS is the gap**: a custom scheme cannot be
 * checked from a page (`canOpenURL` is an app's API), and a scheme no installed app claims is
 * ignored without so much as a console line — the owner would press **pay and log
 * transaction**, the sheet would close, the row would be logged, and nothing would open.
 *
 * So iOS gets one retry: if the page is still on screen shortly after the handoff, Google Pay
 * did not take it, and the generic `upi://pay` link is handed to whatever UPI app the phone
 * has instead. A page that *did* leave (`visibilitychange` to `hidden`) is a page whose app
 * opened, and there the timer is cancelled — no second handoff, no second prompt.
 */
export function handOffToUpiApp(payment: UpiPayment, currency = 'INR'): void {
  if (!canHandOffToUpiApp()) return
  window.location.href = buildGooglePayUri(payment, currency)
  if (!isIos()) return

  const retry = window.setTimeout(() => {
    if (document.visibilityState === 'visible') {
      window.location.href = buildUpiUri(payment, currency)
    }
  }, GOOGLE_PAY_GRACE_MS)

  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') window.clearTimeout(retry)
    },
    { once: true },
  )
}

/**
 * How long Google Pay gets to take the handoff before the generic link is tried.
 *
 * Long enough for a cold app launch on an old phone (the switch usually takes well under a
 * second), short enough that a phone without Google Pay is not left looking at nothing.
 */
const GOOGLE_PAY_GRACE_MS = 1500
