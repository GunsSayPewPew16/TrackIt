/**
 * The artboards' own content, as data.
 *
 * Both screens have two states. With the owner's Wallet history imported they show
 * real money; before anything has been imported they show **exactly what the
 * artboards draw** — $24,860.40 of balance, Blue Bottle Coffee at 8:05 AM, the
 * eleven sample rows spread across the days of the one month the wheel spins through. That
 * is what this file is: the design, kept as literals, so a first visit looks like
 * the design and nothing about it has to be guessed.
 *
 * The figures are the artboards' figures and the currency is the app's: every one
 * of them is drawn in rupees by `format.ts`, because the owner's money is rupees
 * whatever the mockup's dollar signs said. Nothing here is derived — no total is
 * the sum of the rows below it, because the artboard's totals are its own; that in
 * itself is the signal that this is sample content, and `lib/derive.ts` is what
 * replaces it the moment there is something real to show.
 */

import { initialsOf } from "./derive"
import { money, signedMoney, timeOfDayWord, wholeMoney } from "./format"
import type { CardStyle, Kind } from "./types"
import type { DashboardModel, LedgerCard, LedgerDay, LedgerModel } from "./view"

/** The demo history sits in October 2026, which is the artboard's own month. */
const DEMO_YEAR = 2026
const DEMO_MONTH = 9 // October, zero-based

/**
 * The month the wheel draws, and the day it starts on: the 1st through the artboard's
 * newest row, which is what its own month looks like part-way through.
 */
export const DEMO_LAST_DAY = 23
export const DEMO_SELECTED_DAY = 16

/** Faces on the split stack. The artboard tints them sage, clay, ink in turn. */
const FACES = ["AK", "MR", "SJ"]

/** One sample row, exactly as `Ledger.dc.html`'s `P` table writes it. */
type Sample = {
  title: string
  /** `Coffee · Morning run` — the card's subtitle, verbatim. */
  sub: string
  /** The pill above the notch. */
  tag: string
  /** Positive rupees; `kind` carries the direction. */
  rupees: number
  /** The time the card prints, `8:05 AM`. */
  time: string
  style: CardStyle
  /** The tile's Lucide face: `coffee`, `bus`, `cart`, `laptop`, `home`, `wallet`. */
  icon: string
  /** How full the little bar is, as the artboard writes it. */
  pct: number
  /** How many names are on the stack. */
  faces: number
}

/**
 * The artboard's eleven rows, in its own order — the order matters, because the
 * per-day lists below index into it.
 */
const SAMPLES: Sample[] = [
  { title: "Blue Bottle", sub: "Coffee · Morning run", tag: "Coffee", rupees: 5.5, time: "8:05 AM", style: "std", icon: "coffee", pct: 62, faces: 2 },
  { title: "City Transit", sub: "Transit · Commute", tag: "Transit", rupees: 2.75, time: "7:42 AM", style: "std", icon: "bus", pct: 35, faces: 1 },
  { title: "Whole Foods", sub: "Groceries · Weekly shop", tag: "Groceries", rupees: 64.2, time: "6:18 PM", style: "std", icon: "cart", pct: 80, faces: 3 },
  { title: "Nimbus Cloud", sub: "Subscription · Software", tag: "Subscription", rupees: 12.99, time: "9:00 AM", style: "std", icon: "laptop", pct: 45, faces: 1 },
  { title: "Lakeside Rent", sub: "Housing · Monthly rent", tag: "High expense", rupees: 1850, time: "10:00 AM", style: "alt", icon: "home", pct: 96, faces: 2 },
  { title: "Apple Store", sub: "Electronics · Laptop", tag: "High expense", rupees: 1299, time: "3:24 PM", style: "alt", icon: "laptop", pct: 88, faces: 1 },
  { title: "Acme Payroll", sub: "Income · Salary", tag: "Income", rupees: 3210, time: "9:00 AM", style: "inc", icon: "wallet", pct: 100, faces: 1 },
  { title: "Studio Kite", sub: "Income · Freelance invoice", tag: "Income", rupees: 640, time: "11:30 AM", style: "inc", icon: "wallet", pct: 64, faces: 2 },
  { title: "Fresh Bowl", sub: "Dining · Lunch", tag: "Dining", rupees: 14.8, time: "1:10 PM", style: "std", icon: "coffee", pct: 52, faces: 2 },
  { title: "Metro Fuel", sub: "Transport · Fuel", tag: "Transit", rupees: 48.3, time: "5:45 PM", style: "std", icon: "bus", pct: 58, faces: 1 },
  { title: "Cinema Rex", sub: "Entertainment · Movies", tag: "Leisure", rupees: 22, time: "8:15 PM", style: "std", icon: "laptop", pct: 30, faces: 3 },
]

/** Which of the samples each day of the window holds, in the artboard's own order. */
const BY_DAY: Record<number, number[]> = {
  9: [1, 0, 8, 2],
  10: [0, 10, 9],
  11: [0, 8, 3],
  12: [1, 0, 2, 8],
  13: [1, 8, 5, 0],
  14: [0, 9, 7, 3],
  15: [1, 0, 4, 8],
  16: [6, 1, 0, 5],
  17: [0, 10, 8],
  18: [2, 0, 9],
  19: [1, 0, 8, 3],
  20: [7, 0, 2],
  21: [1, 0, 8, 9],
  22: [0, 10, 5],
  23: [1, 0, 6, 8],
}

/** A day and time in the demo month, on the device's own clock. */
function moment(day: number, time: string): number {
  const [clock, meridiem] = time.split(" ")
  const [rawHour, minute] = clock.split(":").map(Number)
  const hour = meridiem === "PM" ? (rawHour % 12) + 12 : rawHour % 12
  return new Date(DEMO_YEAR, DEMO_MONTH, day, hour, minute).getTime()
}

const paise = (rupees: number): number => Math.round(rupees * 100)

const kindOf = (style: CardStyle): Kind => (style === "inc" ? "income" : "expense")

/** One sample as the card the ledger draws. */
function cardFor(sample: Sample, day: number, index: number): LedgerCard {
  const kind = kindOf(sample.style)
  // The artboard writes the line as `Category · note`; the model keeps the two apart so
  // the note can be set in the editorial serif without splitting a string at render.
  const [sub, subNote] = sample.sub.split(" · ")
  return {
    id: `demo-${day}-${index}`,
    title: sample.title,
    sub,
    ...(subNote ? { subNote } : {}),
    tag: sample.tag,
    amount: signedMoney(paise(sample.rupees), kind),
    time: sample.time,
    // The artboard's samples are all drawn from the primary account.
    account: "UPI",
    payee: initialsOf(sample.title),
    pct: sample.pct,
    pctLabel: `${sample.pct}%`,
    // The artboard's own words for the bar.
    pctAria: `${sample.pct}% of category budget used`,
    style: sample.style,
    icon: sample.icon,
    people: FACES.slice(0, sample.faces),
  }
}

/** The month's days up to the artboard's last one, each with its cards. */
export const DEMO_DAYS: LedgerDay[] = Array.from({ length: DEMO_LAST_DAY }, (_, offset) => {
  const day = offset + 1
  const cards = (BY_DAY[day] ?? []).map((sample, index) => cardFor(SAMPLES[sample], day, index))
  return { at: moment(day, "12:00 AM"), cards }
})

/** The ledger screen as the design draws it. */
export const DEMO_LEDGER: LedgerModel = {
  days: DEMO_DAYS,
  selected: DEMO_SELECTED_DAY - 1,
  emptyNote: "Nothing logged on this day.",
  // The artboard's whole history is the one month it draws, so the menu has one
  // entry — and picking it is a no-op that leaves the wheel where it is.
  months: [{ key: "2026-10", label: "October 2026", anchor: moment(DEMO_LAST_DAY, "12:00 AM") }],
}

/** The three rows the dashboard's recent list shows, verbatim from the artboard. */
const DEMO_RECENT = [
  { id: "demo-recent-transit", title: "City Transit", sub: "Transit", subNote: "7:42 AM", amount: signedMoney(paise(2.75), "expense") },
  { id: "demo-recent-coffee", title: "Blue Bottle Coffee", sub: "Coffee", subNote: "8:05 AM", amount: signedMoney(paise(5.5), "expense") },
  { id: "demo-recent-groceries", title: "Whole Foods Market", sub: "Groceries", subNote: "Yesterday", amount: signedMoney(paise(64.2), "expense") },
]

/** Every figure the dashboard draws before the owner has imported anything. */
export const DEMO_DASHBOARD: DashboardModel = {
  // The artboard's two cards, with its own figures: UPI and Cash, what each holds and
  // what has gone out of it. The stack is where the accounts are drawn apart.
  cards: [
    { id: "upi", name: "UPI", icon: "qr", cents: paise(18420.5), balance: money(paise(18420.5)), spent: wholeMoney(paise(3240)) },
    { id: "cash", name: "Cash", icon: "cash", cents: paise(6440), balance: money(paise(6440)), spent: wholeMoney(paise(500)) },
  ],
  quickLog: {
    title: "Quick log",
    context: timeOfDayWord(),
    // The categories are what these three would file under if they were the owner's own
    // rows, because a chip opens the manual entry on its category — see `quickActions` in
    // `lib/derive.ts`, which is the same shape from real history.
    actions: [
      { label: "LOG TRANSIT FARE", primary: true, category: "public-transport" },
      { label: "LOG BREAKFAST", primary: false, category: "restaurant" },
      { label: "LOG COFFEE", primary: false, category: "bar-cafe" },
    ],
  },
  velocity: {
    badge: "BURNING FAST",
    title: "Velocity of spend",
    value: "+14%",
    caption: "vs 30-day baseline",
    // The artboard's own sparkline, point for point, in its 174×56 box.
    points: "0,44 12,40 24,46 36,36 48,40 60,30 72,34 84,24 96,30 108,20 120,26 132,14 144,18 156,8 174,12",
  },
  topCategory: {
    badge: "TOP CATEGORY",
    name: "Dining out",
    icon: "utensils",
    value: wholeMoney(paise(1284)),
    caption: "26% of spending",
  },
  envelope: {
    title: "Envelope limit",
    spent: wholeMoney(paise(240)),
    limit: wholeMoney(paise(600)),
    badge: "40% USED",
    pct: 40,
    chips: ["Groceries: 80% full", "Dining: 62% full", "Transit: 35% full"],
  },
  recent: { title: "Recent transactions", rows: DEMO_RECENT },
}
