/**
 * UPI links, in both directions. Ported from the app's `frontend/src/lib/upi.ts`.
 *
 * Reading is tolerant (codes in the wild come from many apps); writing is strict:
 * every parameter is percent-encoded exactly once, by hand, because
 * `URLSearchParams` turns a space into `+`, and a UPI app reads `+` as a character.
 *
 * Nothing here touches the network, so the manual-entry path and the camera path
 * run through the same code.
 */

/** A payee read out of a QR code (or typed in by hand). */
export type UpiPayee = {
  /** Payee address, the VPA: `name@bank`. */
  pa: string
  /** The merchant's own name, `pn`. */
  pn: string
  /** Paise, when the code carried an amount (`am`); `null` otherwise. */
  amountCents: number | null
  /** The note the code carried (`tn`), if any. */
  note: string
}

export type UpiParseError = "not-upi" | "no-payee" | "bad-payee"

export type UpiParseResult =
  | { ok: true; payee: UpiPayee }
  | { ok: false; reason: UpiParseError }

/**
 * A VPA is `handle@psp`. Deliberately not stricter than that: refusing a real
 * VPA is worse than accepting a malformed one, which the UPI app then refuses.
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

/** The parameters of a UPI link, read by hand. First occurrence wins. */
function readParams(query: string): Map<string, string> {
  const params = new Map<string, string>()
  for (const pair of query.split("&")) {
    if (!pair) continue
    const cut = pair.indexOf("=")
    const key = cut === -1 ? pair : pair.slice(0, cut)
    const value = cut === -1 ? "" : pair.slice(cut + 1)
    const name = decode(key).trim().toLowerCase()
    if (name && !params.has(name)) params.set(name, decode(value).trim())
  }
  return params
}

/** Everything after the first `?`, or a bare `pa=`/`pn=` string; otherwise null. */
function queryOf(text: string): string | null {
  const cut = text.indexOf("?")
  if (cut !== -1) return text.slice(cut + 1)
  return text.includes("pa=") || text.includes("pn=") ? text : null
}

/** Rupees with decimals (`am=120.50`) into integer paise, or `null`. */
function amountToCents(raw: string): number | null {
  if (!raw) return null
  const rupees = Number.parseFloat(raw)
  if (!Number.isFinite(rupees) || rupees <= 0) return null
  return Math.round(rupees * 100)
}

/** Read a payee out of whatever the camera (or the text box) gave us. */
export function parseUpiCode(raw: string): UpiParseResult {
  const text = raw.trim()
  if (!text) return { ok: false, reason: "not-upi" }

  const query = queryOf(text)
  if (query === null) return { ok: false, reason: "not-upi" }

  const params = readParams(query)
  const payeeAddress = params.get("pa") ?? ""
  if (!payeeAddress) return { ok: false, reason: "no-payee" }
  if (!VPA.test(payeeAddress)) return { ok: false, reason: "bad-payee" }

  return {
    ok: true,
    payee: {
      pa: payeeAddress,
      pn: params.get("pn") || payeeAddress.split("@")[0],
      amountCents: amountToCents(params.get("am") ?? ""),
      note: params.get("tn") ?? "",
    },
  }
}

export const UPI_PARSE_MESSAGE: Record<UpiParseError, string> = {
  "not-upi": "That code is not a UPI payment code.",
  "no-payee": "That UPI code has no payee in it.",
  "bad-payee": "That UPI code’s payee address looks wrong.",
}

/** What the app hands to a UPI app: a payee, an amount and a note. */
export type UpiPayment = {
  pa: string
  pn: string
  amountCents: number
  note?: string
  currency?: string
}

/** UPI's own note field is short; the apps truncate anything longer. */
const NOTE_LIMIT = 50

const encode = (value: string): string => encodeURIComponent(value)

/** The parameters of a payment link, in the order a human reads them. */
function upiQuery(payment: UpiPayment, currency: string): string {
  const note = (payment.note ?? "").replace(/\s+/g, " ").trim().slice(0, NOTE_LIMIT)
  const pairs: [string, string][] = [
    ["pa", payment.pa],
    ["pn", payment.pn || payment.pa],
    ["am", (payment.amountCents / 100).toFixed(2)],
    ["cu", payment.currency ?? currency],
  ]
  if (note) pairs.push(["tn", note])
  return pairs.map(([key, value]) => `${key}=${encode(value)}`).join("&")
}

/** The generic payment link: what the QR code itself asked for. */
export function buildUpiUri(payment: UpiPayment, currency = "INR"): string {
  return `upi://pay?${upiQuery(payment, currency)}`
}

/**
 * The Google Pay link. The app uses `gpay://` on iOS and an `intent://` URL that
 * names the Google Pay package on Android. This mockup runs in a desktop browser,
 * where neither handoff exists, so it returns the generic link; the sheet shows it
 * as a copyable fallback either way.
 */
export function buildGooglePayUri(payment: UpiPayment, currency = "INR"): string {
  return buildUpiUri(payment, currency)
}
