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
 * - **`High expense` is a share, not a threshold.** The artboard fills its two
 *   biggest rows with the clay accent, so a row is `alt` when it is at least a
 *   tenth of that month's spending — which is what makes the treatment mean the
 *   same thing in a month of ₹5,000 and a month of ₹50,000.
 * - **The little bar on a card measures a budget where one exists** (the same
 *   envelope the gauge uses) **and the category's share of the month otherwise**,
 *   and it says which, because "62%" with no noun is not a fact.
 * - **The dashboard's own budget is the only figure not derived from rows.** If
 *   the Wallet export carried no `Budget` document, the gauge measures the month's
 *   biggest category against `MONTHLY_BUDGET_CENTS` and says so.
 */

import { OPENING_BALANCE_CENTS } from "./accounts"
import { categoryFor } from "./categories"
import {
  addDays,
  clock,
  greeting,
  localDayKey,
  money,
  monthKey,
  signedMoney,
  startOfDay,
  startOfMonth,
  startOfNextMonth,
  timeOfDayWord,
  whenLabel,
  wholeMoney,
} from "./format"
import { OWNER_NAME } from "./owner"
import type { Budget, Row } from "./types"
import type { DashboardModel, LedgerCard, LedgerDay, LedgerModel } from "./view"

/**
 * What the gauge measures against when the Wallet export brought no budget of its
 * own: ₹1,500 a month, the figure the previous app carried for the same reason.
 */
export const MONTHLY_BUDGET_CENTS = 150000

/** How wide the wheel's window is — the artboard draws fifteen capsules. */
const WHEEL_DAYS = 15

/** The sparkline's own box, from the artboard: points are written into 174×56. */
const SPARK = { width: 174, height: 56, steps: 15, top: 8, bottom: 48 }

const isExpense = (row: Row) => row.kind === "expense"

const sum = (rows: Row[]) => rows.reduce((total, row) => total + row.amountCents, 0)

const inWindow = (rows: Row[], from: number, to: number) => rows.filter((row) => row.at >= from && row.at < to)

/** Everything the owner spent in a window, which is what every total means. */
const spentBetween = (rows: Row[], from: number, to: number) =>
  sum(inWindow(rows.filter(isExpense), from, to))

/** The spend a budget has seen since its own period began. */
function spentUnderBudget(rows: Row[], budget: Budget): number {
  return sum(
    rows.filter(
      (row) => isExpense(row) && row.at >= budget.startDate && budget.categoryIds.includes(row.category),
    ),
  )
}

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

/**
 * A row's treatment, from the row and its month: income is `inc`, the month's big
 * ones are `alt`, everything else is `std` — see this file's header for the share.
 */
function styleOf(row: Row, monthSpend: number): "std" | "alt" | "inc" {
  if (row.kind === "income") return "inc"
  return monthSpend > 0 && row.amountCents >= monthSpend / 10 ? "alt" : "std"
}

/** What a card's pill calls the row: money in, a big one, or the category. */
function tagOf(row: Row, style: "std" | "alt" | "inc"): string {
  if (style === "inc") return "Income"
  if (style === "alt") return "High expense"
  return categoryFor(row.category).label
}

/** One row as the ledger draws it. */
function cardOf(row: Row, monthSpend: number, monthCategorySpend: Map<string, number>, budgets: Budget[]): LedgerCard {
  const category = categoryFor(row.category)
  const style = styleOf(row, monthSpend)

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
    title: row.title || category.label,
    // The artboard's subtitle is the category, then the note: `Coffee · Morning run`.
    sub: row.note ? `${category.label} · ${row.note}` : category.label,
    tag: row.tag ?? tagOf(row, style),
    amount: signedMoney(row.amountCents, row.kind),
    time: clock(row.at),
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
 * The ledger screen: a window of days ending on the anchor, each with its cards.
 * The window is whole days rather than "days with rows", because the wheel is a
 * calendar — a day the owner spent nothing on is a day, not a gap.
 *
 * The anchor defaults to the day of the **newest row**, not to today: opening the
 * ledger on a day nothing happened yet would be a poor first look, and the newest
 * row is what the owner came to see. Picking a month from the menu moves the
 * window (see `LedgerModel.months`).
 */
export function ledgerModel(rows: Row[], budgets: Budget[] = [], anchor?: number): LedgerModel {
  const newest = newestFirst(rows)[0]
  const lastDay = startOfDay(anchor ?? newest?.at ?? Date.now())
  const firstDay = addDays(lastDay, -(WHEEL_DAYS - 1))

  const monthStart = startOfMonth(lastDay)
  const monthRows = inWindow(rows, monthStart, startOfNextMonth(lastDay))
  const monthSpend = sum(monthRows.filter(isExpense))

  // How each category stands this month, in one pass: the bars are per category.
  const monthCategorySpend = new Map<string, number>()
  for (const row of monthRows) {
    if (!isExpense(row)) continue
    monthCategorySpend.set(row.category, (monthCategorySpend.get(row.category) ?? 0) + row.amountCents)
  }

  const days = new Map(byDay(rows))
  const window: LedgerDay[] = []
  for (let index = 0; index < WHEEL_DAYS; index += 1) {
    const at = addDays(firstDay, index)
    const held = days.get(localDayKey(at)) ?? []
    window.push({ at, cards: held.map((row) => cardOf(row, monthSpend, monthCategorySpend, budgets)) })
  }

  return {
    days: window,
    // The anchor is the last capsule: it holds what just happened, or the newest
    // thing in the month the owner picked.
    selected: WHEEL_DAYS - 1,
    emptyNote: "Nothing logged on this day.",
    months: monthsWithRows(rows),
  }
}

/**
 * The predictive tray's actions: what the owner buys at this time of day, from
 * the last thirty days of their own rows. The artboard's own three (a transit
 * fare, breakfast, coffee) are what the demo shows before anything is imported.
 */
function quickActions(rows: Row[], now: number): { label: string; primary: boolean }[] {
  const recent = rows.filter((row) => isExpense(row) && row.at >= addDays(now, -30))
  const counts = new Map<string, { title: string; count: number }>()
  for (const row of recent) {
    const title = (row.title || categoryFor(row.category).label).trim()
    if (!title) continue
    const held = counts.get(title.toLowerCase())
    if (held) held.count += 1
    else counts.set(title.toLowerCase(), { title, count: 1 })
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, 3)
    .map((entry, index) => ({ label: `LOG ${entry.title.toUpperCase()}`, primary: index === 0 }))
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

/** The gauge, from the export's own budgets where there are any. */
function envelope(rows: Row[], budgets: Budget[], monthSpend: number, now: number): DashboardModel["envelope"] {
  const monthStart = startOfMonth(now)
  const monthRows = inWindow(rows.filter(isExpense), monthStart, startOfNextMonth(now))

  if (budgets.length > 0) {
    // The envelope the owner is furthest into is the one worth showing.
    const measured = budgets
      .map((budget) => {
        const spent = sum(monthRows.filter((row) => budget.categoryIds.includes(row.category)))
        const used = spentUnderBudget(rows, budget) || spent
        return { budget, spent, used, pct: pctOf(used, budget.limitCents) }
      })
      .sort((a, b) => b.pct - a.pct)
    const lead = measured[0]
    return {
      title: lead.budget.name,
      // The gauge's own two figures are headlines, so they carry no paise — the
      // same reason the artboard writes `$240 / $600` and not `$240.00 / $600.00`.
      spent: wholeMoney(lead.used),
      limit: wholeMoney(lead.budget.limitCents),
      badge: `${lead.pct}% USED`,
      pct: lead.pct,
      chips: measured.slice(1, 4).map((entry) => `${entry.budget.name.toUpperCase()}: ${entry.pct}% FULL`),
    }
  }

  // No budget in the export: the month's own biggest category, against the app's
  // standing figure, and the chips name the next three by share.
  const byCategory = new Map<string, number>()
  for (const row of monthRows) {
    byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.amountCents)
  }
  const ranked = [...byCategory.entries()].sort((a, b) => b[1] - a[1])
  const pct = pctOf(monthSpend, MONTHLY_BUDGET_CENTS)
  return {
    title: "Monthly budget",
    spent: wholeMoney(monthSpend),
    limit: wholeMoney(MONTHLY_BUDGET_CENTS),
    badge: `${pct}% USED`,
    pct,
    chips: ranked
      .slice(1, 4)
      .map(([id, spent]) => `${categoryFor(id).label.toUpperCase()}: ${pctOf(spent, monthSpend)}% OF SPEND`),
  }
}

/**
 * Everything the dashboard draws, from rows: the balance both accounts add up to,
 * this month's flow, the pace of the last week against the month behind it, the
 * category the money is actually going to, the envelope that is furthest into its
 * limit, and what just happened.
 */
export function dashboardModel(rows: Row[], budgets: Budget[] = [], now: number = Date.now()): DashboardModel {
  const expenses = rows.filter(isExpense)
  const income = rows.filter((row) => row.kind === "income")

  const balance = OPENING_BALANCE_CENTS + sum(income) - sum(expenses)

  const monthStart = startOfMonth(now)
  const monthEnd = startOfNextMonth(now)
  const monthIncome = sum(inWindow(income, monthStart, monthEnd))
  const monthSpent = spentBetween(rows, monthStart, monthEnd)

  const lastMonthStart = startOfMonth(addDays(monthStart, -1))
  const lastMonthNet =
    sum(inWindow(income, lastMonthStart, monthStart)) - spentBetween(rows, lastMonthStart, monthStart)

  const net = monthIncome - monthSpent
  // The arrow follows the money — a month that ends up is an up arrow — while the
  // sentence under it is a real comparison against last month, which is why the
  // two are decided separately rather than assumed to agree.
  const deltaUp = net >= 0
  const rose = net > lastMonthNet

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
  const topCategory = top ? categoryFor(top[0]) : undefined

  const recent = newestFirst(rows).slice(0, 5)

  return {
    greeting: `${greeting(now)}, ${OWNER_NAME}`,
    balance: { label: "Total available balance", value: money(Math.max(balance, 0)) },
    cashFlow: {
      chip: "MONTHLY CASH FLOW",
      // Signed by hand rather than through `netMoney`, because this one is a
      // headline too: `+₹1,240`, not `+₹1,240.00`.
      delta: `${net < 0 ? "−" : "+"}${wholeMoney(Math.abs(net))}`,
      deltaUp,
      deltaNote: rose ? "up on last month" : "down on last month",
      income: { label: "Income", value: money(monthIncome) },
      spent: { label: "Spent", value: money(monthSpent) },
    },
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
      name: topCategory?.label ?? "Nothing yet",
      // The category's own marker, which `RowIcon` draws when the name is not a
      // Lucide icon of its own.
      icon: topCategory?.id ?? "unknown",
      value: wholeMoney(top?.[1] ?? 0),
      caption: `${pctOf(top?.[1] ?? 0, monthSpent)}% of spending`,
    },
    envelope: envelope(rows, budgets, monthSpent, now),
    recent: {
      title: "Recent transactions",
      rows: recent.map((row) => ({
        id: row.id,
        title: row.title || categoryFor(row.category).label,
        sub: `${categoryFor(row.category).label} · ${whenLabel(row.at, now)}`,
        amount: signedMoney(row.amountCents, row.kind),
      })),
    },
  }
}

/** Whether the owner has imported anything yet, which is what picks the models. */
export const hasHistory = (rows: Row[]): boolean => rows.length > 0
