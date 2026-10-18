/**
 * Money, days and the time of day — every string a screen shows that is not data.
 *
 * The greeting is deliberately *not* here any more: it is two fixed words rather than
 * something the clock decides, so they live in `lib/owner.ts` with the name they
 * belong to.
 *
 * Money is **integer paise** everywhere in this project (the Wallet export writes
 * paise, the app stores paise, the CSV export divides by 100 once, at the edge).
 * The owner's money is **rupees**, and `en-IN` is what groups them the way they
 * are written in India: ₹18,084.07, not ₹18.084,07.
 *
 * The amounts on the ledger cards carry a sign the way the artboard draws it —
 * a true minus sign (U+2212, not a hyphen), plus for money in — which is a
 * typographic decision, so it lives here rather than in the component.
 */

/** The owner's money. The Wallet export is the reason it is rupees. */
export const DEFAULT_CURRENCY = "INR"

const RUPEES = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Rupees with two decimals and Indian grouping: `1808407` → `18,084.07`. */
export function rupees(cents: number): string {
  return RUPEES.format(cents / 100)
}

/** The same figure with its currency mark: `₹18,084.07`. */
export function money(cents: number): string {
  return `₹${rupees(cents)}`
}

const WHOLE_RUPEES = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 })

/**
 * A figure with no paise on it, for the places the design writes one: the
 * envelopes (`$240 / $600`), the top category (`$1,284`) and the month's own net
 * (`+$1,240`). Two decimals are what a *balance* and a *row* carry; a headline
 * figure halves the width it takes and is what the artboards show.
 */
export function wholeMoney(cents: number): string {
  return `₹${WHOLE_RUPEES.format(cents / 100)}`
}

/** A ledger amount: money out carries a minus, money in a plus. */
export function signedMoney(cents: number, kind: "expense" | "income"): string {
  return `${kind === "income" ? "+" : "−"}${money(Math.abs(cents))}`
}

/** Money with an explicit direction, for a net figure that can go either way. */
export function netMoney(cents: number): string {
  return `${cents < 0 ? "−" : "+"}${money(Math.abs(cents))}`
}

/**
 * What the owner typed into an amount field, as integer paise — `null` when it is not a
 * number at all.
 *
 * Commas are **grouping** in this app's own money (`18,084.07`), so they are dropped
 * rather than read as a decimal point: `1,500` is fifteen hundred rupees, not one and a
 * half. Everything that is not a digit or a dot is ignored, which is what makes a pasted
 * `₹250` a number; a minus sign goes with it, because a payment is not negative and the
 * caller refuses an empty or zero field anyway.
 */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/,/g, "").replace(/[^0-9.]/g, "")
  if (!cleaned || cleaned === ".") return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

const CLOCK = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
const SHORT_DAY = new Intl.DateTimeFormat("en-US", { weekday: "short" })
const DAY_AND_MONTH = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" })
const WHOLE_DAY = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" })
const MONTH_AND_YEAR = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" })

/** The artboard's clock: `8:05 AM`. */
export const clock = (at: number): string => CLOCK.format(at)

/** A three-letter weekday, which is what the date wheel writes under the number. */
export const dayOfWeek = (at: number): string => SHORT_DAY.format(at)

/** The number on a date capsule. */
export const dayNumber = (at: number): number => new Date(at).getDate()

/** The wheel's title: `October 2026`. */
export const monthLabel = (at: number): string => MONTH_AND_YEAR.format(at)

/** `2026-10-11`, on the device's own clock — the key rows are grouped by. */
export function localDayKey(at: number): string {
  const when = new Date(at)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`
}

/**
 * The month a moment falls in, as `2026-10`, on the device's own clock — the key a
 * month is remembered by. It is a day key with its tail cut off, so a month and a
 * day can never disagree about which one a moment is in.
 */
export const monthKey = (at: number): string => localDayKey(at).slice(0, 7)

/** Midnight at the start of the day a moment falls in. */
export function startOfDay(at: number): number {
  const when = new Date(at)
  when.setHours(0, 0, 0, 0)
  return when.getTime()
}

/** The same time of day, `days` later (negative for earlier). */
export function addDays(at: number, days: number): number {
  const when = new Date(at)
  when.setDate(when.getDate() + days)
  return when.getTime()
}

/** Midnight on the first of the month a moment falls in. */
export function startOfMonth(at: number): number {
  const when = new Date(at)
  when.setDate(1)
  when.setHours(0, 0, 0, 0)
  return when.getTime()
}

/** Midnight on the first of the following month. */
export function startOfNextMonth(at: number): number {
  const when = new Date(at)
  when.setDate(1)
  when.setHours(0, 0, 0, 0)
  when.setMonth(when.getMonth() + 1)
  return when.getTime()
}

/** Whether two moments are on the same local day. */
export const sameDay = (a: number, b: number): boolean => localDayKey(a) === localDayKey(b)

/**
 * How a row's day reads beside a time: `7:42 AM` for today, `Yesterday`, and
 * `12 Oct` beyond that — the artboard's own three cases, and `now` is a parameter
 * so that the same screen can be rendered at a fixed moment in a test.
 */
export function whenLabel(at: number, now = Date.now()): string {
  if (sameDay(at, now)) return clock(at)
  if (sameDay(at, addDays(now, -1))) return "Yesterday"
  return DAY_AND_MONTH.format(at)
}

/**
 * A whole day as a field writes it: `Today`, `Yesterday`, or `Oct 12, 2026`.
 *
 * The add-record sheet's date pill uses this rather than `whenLabel`, because a date
 * field is about the *day* and not about a clock, and because a two-day-old row has to
 * read as a date the owner recognises rather than as `9:41 AM`.
 */
export function dayLabel(at: number, now = Date.now()): string {
  if (sameDay(at, now)) return "Today"
  if (sameDay(at, addDays(now, -1))) return "Yesterday"
  return WHOLE_DAY.format(at)
}

/** The time of day as a single word, which is the quick-log tray's own label. */
export function timeOfDayWord(at: number = Date.now()): string {
  const hour = new Date(at).getHours()
  if (hour < 12) return "Morning"
  if (hour < 17) return "Afternoon"
  if (hour < 21) return "Evening"
  return "Night"
}
