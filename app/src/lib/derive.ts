/**
 * The owner's own money, turned into the two screens.
 *
 * `lib/demo.ts` holds the artboards' content; this file holds the same models
 * computed from rows. Between them they are the whole difference between a first
 * visit and a real one, and the screens cannot tell which they are showing.
 *
 * Every decision a figure needs is written down here rather than in a component,
 * and the awkward ones are these:
 *
 * - **Money in is never spending.** Every "spent" figure counts `kind: "expense"`
 *   only; the balance is both openings plus income minus expenses; the cash-flow
 *   card prints both halves because it holds both.
 * - **A row's degree is a share of its account, not a threshold.** Its notch reads
 *   `High`, `Medium` or `Trivial` plus `Expense` or `Income`, decided by the row's amount
 *   against the balance its account held just before it (`balancesBefore`): at least 20%
 *   is High, at least 5% is Medium, anything less is Trivial. An account with nothing in
 *   it has no share to measure, so a row out of it is High. A High expense is the clay
 *   card, and the share means the same thing on a ₹5,000 account as on a ₹50,000 one.
 * - **The little bar on a card measures a budget where one exists** (the envelope
 *   the export carried for that category) **and the category's share of the month
 *   otherwise**, and it says which, because "62%" with no noun is not a fact.
 * - **The dashboard's envelopes are the budgets** from `lib/budget.ts`, and each one's
 *   limit **and the categories it tracks** are handed in rather than read, because the
 *   owner can change both from the card itself. They are not the export's own `Budget`
 *   documents — those stay on the ledger's per-row bars — and each counts the categories
 *   the owner chose, so a taxi can never make the food envelope look full unless it was
 *   asked to. The stats dial is the *other* budget (all spending), which is why the cards
 *   can no longer share one figure.
 *
 * **Balances come from the store, not from the table.** Each card's opening is handed in
 * (`lib/balances.ts`), because the owner can set what a card reads by holding it; what is
 * derived is still the same sum — opening, plus income, minus expenses.
 */

import { ACCOUNTS, accountFor } from "./accounts"
import { budgetSpent, defaultEnvelopes, type Envelope } from "./budget"
import { categoryFor } from "./categories"
// The name a person reads, which is the new tree's where it renamed an envelope: see
// `lib/refile.ts`. The table itself is still the source of the id and the icon.
import { filedName } from "./refile"
import {
  addDays,
  clock,
  localDayKey,
  money,
  monthKey,
  signedMoney,
  startOfDay,
  startOfMonth,
  startOfNextMonth,
  timeOfDayWord,
  titleCase,
  whenLabel,
  wholeMoney,
} from "./format"

import type { Budget, Row } from "./types"
import type { CustomCard } from "./customCards"
import { customCardsOf } from "./customCards"
import type { DashboardModel, LedgerCard, LedgerDay, LedgerModel } from "./view"

/** The sparkline's own box, from the artboard: points are written into 174×56. */
const SPARK = { width: 174, height: 56, steps: 15, top: 8, bottom: 48 }

const isExpense = (row: Row) => row.kind === "expense"

const sum = (rows: Row[]) => rows.reduce((total, row) => total + row.amountCents, 0)

const inWindow = (rows: Row[], from: number, to: number) => rows.filter((row) => row.at >= from && row.at < to)

/** Everything the owner spent in a window, which is what every total means. */
const spentBetween = (rows: Row[], from: number, to: number) =>
  sum(inWindow(rows.filter(isExpense), from, to))

/** A percentage, whole, and never above 100 on a bar that cannot pass its end. */
const pctOf = (part: number, whole: number): number =>
  whole <= 0 ? 0 : Math.min(100, Math.round((part / whole) * 100))

/** Rows newest first, which is how every list on both screens is ordered. */
export const newestFirst = (rows: Row[]): Row[] => [...rows].sort((a, b) => b.at - a.at)

/** Rows grouped into days, keyed by `YYYY-MM-DD`, newest day first. */
function byDay(rows: Row[]): Map<string, Row[]> {
  const days = new Map<string, Row[]>()
  for (const row of newestFirst(rows)) {
    const key = localDayKey(row.at)
    const list = days.get(key)
    if (list) list.push(row)
    else days.set(key, [row])
  }
  return days
}

/** How big a row is against the balance its account held when it landed. */
export type Degree = "High" | "Medium" | "Trivial"

/** At or above this share of the balance, a row is High. */
const HIGH_SHARE = 20
/** At or above this share (and under High), a row is Medium; under it, Trivial. */
const MEDIUM_SHARE = 5

/**
 * A row's degree. An account with nothing in it, or in the red, has no share to measure, so any
 * row out of it is High.
 */
function degreeOf(row: Row, balanceBefore: number): Degree {
  if (balanceBefore <= 0) return "High"
  const share = (row.amountCents / balanceBefore) * 100
  if (share >= HIGH_SHARE) return "High"
  if (share >= MEDIUM_SHARE) return "Medium"
  return "Trivial"
}

/**
 * What each row's account held just before that row: its opening, plus every income and expense
 * that landed before it. Rows are walked oldest first, so each one sees only what came before.
 */
function balancesBefore(rows: Row[], openings: Record<string, number>): Map<string, number> {
  const running = new Map<string, number>()
  const before = new Map<string, number>()
  for (const row of [...rows].sort((a, b) => a.at - b.at)) {
    const account = accountFor(row.account).id
    const current =
      running.get(account) ?? openings[account] ?? ACCOUNTS.find((candidate) => candidate.id === account)?.openingCents ?? 0
    before.set(row.id, current)
    running.set(account, current + (row.kind === "income" ? row.amountCents : -row.amountCents))
  }
  return before
}

/**
 * A row's treatment, from its degree: income is `inc`, a High expense is `alt`, everything else
 * is `std` — the colour follows the label the notch carries.
 */
function styleOf(row: Row, degree: Degree): "std" | "alt" | "inc" {
  if (row.kind === "income") return "inc"
  return degree === "High" ? "alt" : "std"
}

/** What a card's notch calls the row: its degree and whether it is money in or out. */
function tagOf(row: Row, degree: Degree): string {
  return `${degree} ${row.kind === "income" ? "Income" : "Expense"}`
}

/**
 * The initials of a name: the first letter of its first two words (`Chai Point` → `CP`), or the
 * first two letters of a single word (`Blinkit` → `BL`).
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ""
  const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)
  return letters.toUpperCase()
}

/** One row as the ledger draws it. */
function cardOf(
  row: Row,
  monthSpend: number,
  monthCategorySpend: Map<string, number>,
  budgets: Budget[],
  balanceBefore: number,
): LedgerCard {
  const category = categoryFor(row.category)
  const name = filedName(row.category)
  const degree = degreeOf(row, balanceBefore)
  const style = styleOf(row, degree)

  // The same envelope the gauge measures, where one covers this category.
  const budget = budgets.find((candidate) => candidate.categoryIds.includes(row.category))
  const pct = budget
    ? pctOf(monthCategorySpend.get(row.category) ?? 0, budget.limitCents)
    : pctOf(monthCategorySpend.get(row.category) ?? 0, monthSpend)
  const pctAria = budget
    ? `${pct}% of this category’s budget used`
    : `${pct}% of this month’s spending`

  return {
    id: row.id,
    title: row.title || name,
    // The artboard's subtitle is the category, then the note: `Coffee · Morning run`.
    sub: name,
    ...(row.note ? { subNote: row.note } : {}),
    tag: row.tag ?? tagOf(row, degree),
    amount: signedMoney(row.amountCents, row.kind),
    time: clock(row.at),
    account: accountFor(row.account).name,
    payee: initialsOf(row.title || name),
    pct,
    pctLabel: `${pct}%`,
    pctAria,
    style,
    // A row that names its own face keeps it; an imported one wears its category's mark.
    icon: row.icon ?? category.id,
    people: row.people ?? [],
  }
}

/**
 * The months the history touches, newest first, each with the newest day in it.
 *
 * The anchor is that day rather than the month's end, because landing on the last
 * day of a month someone stopped spending in the middle of would open the ledger
 * on an empty sheet.
 */
function monthsWithRows(rows: Row[]): { key: string; label: string; anchor: number }[] {
  const newestByMonth = new Map<string, number>()
  for (const row of newestFirst(rows)) {
    const key = monthKey(row.at)
    if (!newestByMonth.has(key)) newestByMonth.set(key, startOfDay(row.at))
  }
  return [...newestByMonth.entries()].map(([key, anchor]) => ({
    key,
    label: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(anchor),
    anchor,
  }))
}

/**
 * The ledger screen: the month the anchor falls in, **every day of it**, each with its
 * cards. The window is whole days rather than "days with rows", because the wheel is a
 * calendar — a day the owner spent nothing on is a day, not a gap.
 *
 * **It runs from the month's 1st.** It used to be a fifteen-day window, which meant the
 * first of the month was simply not reachable by dragging — the owner's newer date
 * container is a month, and the month menu is what reaches the months behind it. The
 * ongoing month stops at **today**, because a day that has not happened yet is not a day
 * to scroll to; a month in the past runs to its own last day.
 *
 * The anchor defaults to the day of the **newest row**, not to today: opening the ledger
 * on a day nothing happened yet would be a poor first look, and the newest row is what
 * the owner came to see. That day is also the capsule the wheel opens on, so `selected`
 * is an index into the month rather than a fixed seat at its end.
 */
export function ledgerModel(
  rows: Row[],
  budgets: Budget[] = [],
  anchor?: number,
  /** The opening balance of each account, in paise (`lib/balances.ts`), as the dashboard reads them. */
  openings: Record<string, number> = {},
): LedgerModel {
  const newest = newestFirst(rows)[0]
  const anchorDay = startOfDay(anchor ?? newest?.at ?? Date.now())

  const monthStart = startOfMonth(anchorDay)
  const monthEnd = startOfNextMonth(anchorDay)
  const today = startOfDay(Date.now())
  // The ongoing month stops at today; one behind us runs to its last day.
  const lastDay = Math.max(monthStart, monthEnd > today ? today : addDays(monthEnd, -1))

  const monthRows = inWindow(rows, monthStart, monthEnd)
  const monthSpend = sum(monthRows.filter(isExpense))

  // How each category stands this month, in one pass: the bars are per category.
  const monthCategorySpend = new Map<string, number>()
  for (const row of monthRows) {
    if (!isExpense(row)) continue
    monthCategorySpend.set(row.category, (monthCategorySpend.get(row.category) ?? 0) + row.amountCents)
  }

  const before = balancesBefore(rows, openings)
  const days = new Map(byDay(rows))
  const window: LedgerDay[] = []
  for (let at = monthStart; at <= lastDay; at = addDays(at, 1)) {
    const held = days.get(localDayKey(at)) ?? []
    window.push({
      at,
      cards: held.map((row) => cardOf(row, monthSpend, monthCategorySpend, budgets, before.get(row.id) ?? 0)),
    })
  }

  return {
    days: window,
    // The anchor's own day, clamped into the month the window actually holds — which is
    // what puts the wheel on what just happened rather than on the 1st.
    selected: Math.max(0, Math.min(window.length - 1, new Date(anchorDay).getDate() - 1)),
    emptyNote: "Nothing logged on this day.",
    months: monthsWithRows(rows),
  }
}

/**
 * The predictive tray's actions: what the owner buys at this time of day, from
 * the last thirty days of their own rows. The artboard's own three (a transit
 * fare, breakfast, coffee) are what the demo shows before anything is imported.
 *
 * **Each action carries the category its own rows were filed under**, because the tray is
 * a door into the manual entry: pressing it opens the sheet with that category already
 * chosen (`App.tsx` hands it in, `ManualEntryScreen` starts on it), so the common entry
 * is one tap and a figure rather than a tap, a figure and a walk through the mosaic. A
 * title the owner has filed two ways carries the envelope most of those rows used, which
 * is the one they most often mean.
 */
function quickActions(rows: Row[], now: number): { label: string; primary: boolean; category: string }[] {
  const recent = rows.filter((row) => isExpense(row) && row.at >= addDays(now, -30))
  const counts = new Map<string, { title: string; count: number; categories: Map<string, number> }>()
  for (const row of recent) {
    const title = (row.title || filedName(row.category)).trim()
    if (!title) continue
    const held = counts.get(title.toLowerCase())
    if (held) {
      held.count += 1
      held.categories.set(row.category, (held.categories.get(row.category) ?? 0) + 1)
    } else {
      counts.set(title.toLowerCase(), { title, count: 1, categories: new Map([[row.category, 1]]) })
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, 3)
    .map((entry, index) => ({
      // `Log Restaurants`, not `LOG RESTAURANTS`: the chip is an offer, and the tray is where
      // the owner's own words are read back to them. `titleCase` is what keeps a merchant's
      // capitals and an export's capitals from arriving in the same shouting voice.
      label: `Log ${titleCase(entry.title)}`,
      primary: index === 0,
      category: [...entry.categories.entries()].sort((a, b) => b[1] - a[1])[0][0],
    }))
}

/**
 * The sparkline: the last fifteen days of spending, drawn into the artboard's own
 * 174×56 box with its 15 points and its 8–48 band, so the line sits where the
 * design's line sits whatever the figures are.
 */
function sparkline(rows: Row[], now: number): string {
  const days: number[] = []
  for (let offset = SPARK.steps - 1; offset >= 0; offset -= 1) {
    const start = startOfDay(addDays(now, -offset))
    days.push(spentBetween(rows, start, addDays(start, 1)))
  }
  const peak = Math.max(...days, 1)
  const step = SPARK.width / (SPARK.steps - 1)
  return days
    .map((spend, index) => {
      const x = Math.round(index * step)
      const y = Math.round(SPARK.bottom - (spend / peak) * (SPARK.bottom - SPARK.top))
      return `${x},${y}`
    })
    .join(" ")
}

/**
 * One envelope: what its categories have taken this month, how much of the owner's limit
 * that is, and where it went.
 *
 * Both figures are the month's, and the limit is the one handed in from `lib/budget.ts`
 * (₹1,500 for a new envelope, until the owner changes it). The chips rank whatever the
 * budget actually counted, and each is a share of what it has spent rather than of the
 * limit on purpose: the chips sum with their siblings to the whole of what went out, which
 * is the question the card's left-hand figure raises.
 */
function envelope(rows: Row[], now: number, budget: Envelope): DashboardModel["envelopes"][number] {
  const monthStart = startOfMonth(now)
  const monthRows = inWindow(rows.filter(isExpense), monthStart, startOfNextMonth(now))
  const spent = budgetSpent(rows, monthStart, startOfNextMonth(now), budget.tracked)

  // The chips rank whatever the budget actually counted: with the first envelope's default
  // set that is the F&B dimension's four ids, and with the owner's own selection it is
  // that selection.
  const tracked = budget.tracked === null ? null : new Set(budget.tracked)
  const byCategory = new Map<string, number>()
  for (const row of monthRows) {
    if (tracked !== null && !tracked.has(row.category)) continue
    byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.amountCents)
  }
  const ranked = [...byCategory.entries()].sort((a, b) => b[1] - a[1])
  const pct = pctOf(spent, budget.limitCents)

  return {
    id: budget.id,
    // The owner's own name for the envelope, which is `F&B Budget` until they change it.
    title: budget.name,
    // The gauge's own two figures are headlines, so they carry no paise — the
    // same reason the artboard writes `$240 / $600` and not `$240.00 / $600.00`.
    spent: wholeMoney(spent),
    limit: wholeMoney(budget.limitCents),
    badge: `${pct}% USED`,
    pct,
    chips: ranked.map(([id, cents]) => `${filedName(id)}: ${pctOf(cents, spent)}% of spend`),
  }
}

/**
 * Everything the dashboard draws, from rows: the balance both accounts add up to,
 * this month's flow, the pace of the last week against the month behind it, the
 * category the money is actually going to, the budget envelopes, and what just
 * happened.
 */
export function dashboardModel(
  rows: Row[],
  now: number = Date.now(),
  /**
   * The dashboard's envelopes, in carousel order — the owner's own names, limits and
   * categories (`lib/budget.ts`). Omitted, the app's first envelope is used.
   */
  envelopes: Envelope[] = defaultEnvelopes(),
  /**
   * The opening balance of each account, in paise (`lib/balances.ts`). Omitted, the import's
   * own openings are used, which is what every caller but the app wants.
   */
  openings: Record<string, number> = {},
  custom: CustomCard[] = [],
): DashboardModel {
  const expenses = rows.filter(isExpense)

  const monthStart = startOfMonth(now)
  const monthEnd = startOfNextMonth(now)
  const monthSpent = spentBetween(rows, monthStart, monthEnd)

  // The last week's daily pace against the last thirty days': the design's own
  // comparison, and the reason its badge has words in it as well as a number.
  const week = spentBetween(rows, addDays(startOfDay(now), -6), addDays(startOfDay(now), 1))
  const monthish = spentBetween(rows, addDays(startOfDay(now), -29), addDays(startOfDay(now), 1))
  const change = monthish > 0 ? Math.round(((week / 7) / (monthish / 30) - 1) * 100) : 0
  const pace = change >= 10 ? "BURNING FAST" : change <= -10 ? "EASING OFF" : "STEADY PACE"

  // The category the money is going to, and the share it holds of the month.
  const byCategory = new Map<string, number>()
  for (const row of inWindow(expenses, monthStart, monthEnd)) {
    byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.amountCents)
  }
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0]

  // Three, which is what the card is drawn for: the artboard's recent section is a 48px
  // header and three 64px rows inside 280px, and the demo content (`lib/demo.ts`) has
  // always been those same three. Taking five put two of them outside the card, which
  // only shows once there is real history to show — the demo's three rows hid it.
  const recent = newestFirst(rows).slice(0, 3)

  // One card per account, in Wallet's own order: what that account holds (its opening,
  // plus its income, minus its expenses) and what has gone out of it this month. A row
  // with no account — a hand-written file, a Shortcut — is the primary account's, which
  // is the same rule the import follows.
  const cards = ACCOUNTS.map((account) => {
    const own = rows.filter((row) => accountFor(row.account).id === account.id)
    const balance =
      (openings[account.id] ?? account.openingCents) +
      sum(own.filter((row) => row.kind === "income")) -
      sum(own.filter(isExpense))
    return {
      id: account.id,
      name: account.name,
      icon: account.id === "upi" ? ("qr" as const) : ("cash" as const),
      cents: Math.max(balance, 0),
      balance: money(Math.max(balance, 0)),
      spent: wholeMoney(spentBetween(own, monthStart, monthEnd)),
    }
  })

  return {
    cards: [...cards, ...customCardsOf(custom, openings)],
    quickLog: {
      title: "Quick log",
      context: timeOfDayWord(now),
      actions: quickActions(rows, now),
    },
    velocity: {
      badge: pace,
      title: "Velocity of spend",
      value: `${change > 0 ? "+" : ""}${change}%`,
      caption: "vs 30-day baseline",
      points: sparkline(rows, now),
    },
    topCategory: {
      badge: "TOP CATEGORY",
      name: top ? filedName(top[0]) : "Nothing yet",
      // The category's own marker, which `RowIcon` draws when the name is not a
      // Lucide icon of its own.
      icon: top?.[0] ?? "unknown",
      value: wholeMoney(top?.[1] ?? 0),
      caption: `${pctOf(top?.[1] ?? 0, monthSpent)}% of spending`,
    },
    envelopes: envelopes.map((budget) => envelope(rows, now, budget)),
    recent: {
      title: "Recent transactions",
      rows: recent.map((row) => ({
        id: row.id,
        title: row.title || filedName(row.category),
        sub: filedName(row.category),
        subNote: whenLabel(row.at, now),
        amount: signedMoney(row.amountCents, row.kind),
      })),
    },
  }
}

/** Whether the owner has imported anything yet, which is what picks the models. */
export const hasHistory = (rows: Row[]): boolean => rows.length > 0
