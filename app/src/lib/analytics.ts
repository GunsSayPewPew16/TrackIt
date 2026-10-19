import { OPENING_BALANCE_CENTS } from "./accounts"
import { BUDGET_DEFAULTS, BUDGET_TRACKED_DEFAULTS, budgetSpent } from "./budget"
import { categoryFor, groupLabel } from "./categories"
import { addDays, localDayKey, startOfDay, startOfMonth, startOfNextMonth } from "./format"
import type { Row } from "./types"

/**
 * The analytics screen's figures, derived from the owner's rows the way the dashboard and
 * the ledger are. The spend figures count expenses only; the balance is what both accounts
 * hold together, which is income and expense alike.
 */

/**
 * The heatmap's window: nine weeks, about two months, and **the same window in both views**.
 *
 * The card used to hold ten weeks while the expanded sheet held nine, and each page is scaled
 * to its own busiest day. So the card's extra week could be the page's heaviest one (a rent
 * day, say), and every square the two views shared was then drawn at a fraction of the tint
 * the sheet gave it — the same day, two colours, and the card looked empty. One window means
 * one set of days and one scale: a square keeps its column and its colour wherever it is
 * drawn.
 */
export const HEAT_WEEKS = 9
/** The allocation's window: the months it stacks, ending this one. */
export const ALLOCATION_MONTHS = 12
/** How many groups get their own colour in the allocation; the rest are one grey band. */
const TOP_GROUPS = 4

/**
 * The allocation's colours, and **they belong to the theme**: the biggest groups take these in
 * order, and everything past them is "Other". The stack is read as one figure rather than as five
 * category colours, so it is drawn from the palette's own two accents — the chart hue, then the
 * warning — followed by two tones mixed from them, instead of from the saturated `--data-*` set
 * the manual-entry matrix paints its category tiles with. Those data colours are the owner's
 * categories and stay put from theme to theme; a graph is the theme's own voice.
 */
const ALLOCATION_COLOURS = [
  "var(--chart)",
  "var(--clay)",
  "color-mix(in oklab, var(--chart) 55%, var(--ink))",
  "color-mix(in oklab, var(--ink) 45%, var(--card))",
]

export interface HeatCell {
  key: string
  /** Local midnight of the day. */
  at: number
  cents: number
  /**
   * How much was spent that day, from 0 (nothing: an outline) to 1 (the page's busiest day).
   * Drawn as a single hue whose lightness follows it, so the lightest square is the least.
   */
  intensity: number
  /** After today: drawn as nothing at all. Only the newest page can have these. */
  future: boolean
}

export interface HeatmapModel {
  /** `weeks` × 7 cells, a week to a column, Monday first. */
  cells: HeatCell[]
  /**
   * Midnight of the first cell and of the last day the window **shows**: today on the newest
   * page, whose trailing cells are still in the future, and the window's own last Sunday on
   * an earlier one, where every cell is a day that has happened.
   */
  start: number
  end: number
  /** Whether any row is older than this window, so an earlier page has something on it. */
  canGoEarlier: boolean
}

export interface BalanceModel {
  /** Every day of the current month, the 1st first. `cents` is `null` after today. */
  days: { at: number; cents: number | null }[]
  /** The index of today: the last day with a balance. */
  today: number
  /** The lowest and highest balance drawn, in paise: the two ends the money scale is labelled with. */
  low: number
  high: number
}

export interface AllocationSegment {
  key: string
  label: string
  color: string
}

export interface AllocationMonth {
  at: number
  /** The short label under the bar: `OCT`. */
  label: string
  /** The month in full, for the breakdown: `October 2026`. */
  name: string
  /** Integer paise spent in each segment, lined up with `segments`. */
  cents: number[]
  /** Integer paise: the month's whole spend. */
  total: number
  /** Each segment's share of the month, lined up with `segments`. Sums to 1, or to 0 for a month with no spend. */
  shares: number[]
  /**
   * Segment indexes with any spend, biggest first. A bar stacks in this order from the bottom, so
   * its largest category sits at the foot and its smallest at the top.
   */
  order: number[]
}

export interface AllocationModel {
  /** Oldest month first. */
  months: AllocationMonth[]
  segments: AllocationSegment[]
}

export interface GaugeMonth {
  /** Local midnight of the month's first day, which is also its key. */
  at: number
  /** `OCT` — the pill in the carousel. Carries the year (`OCT ’25`) outside this one. */
  short: string
  /** `Oct` — what the dial calls the month when it is not this one. */
  name: string
  /** `October 2026` — the pill's accessible name and the dial's aria-label. */
  label: string
  /** Everything this budget counts in the month, in paise. */
  cents: number
}

export interface GaugeModel {
  /**
   * The months the dial can be turned to, oldest first: every month with an expense logged,
   * plus this one even when it has none, so the dial always opens somewhere. A month between
   * two busy ones with nothing in it is not a stop — the carousel is the history, not a
   * calendar. Whatever the category, the figure is the whole of that month's spending.
   */
  months: GaugeMonth[]
  /**
   * What the gauge measures against: the owner's total-spending budget (`lib/budget.ts`),
   * handed in by the screen so the dial and the card that edits it read one number.
   */
  target: number
}

const isExpense = (row: Row) => row.kind === "expense"

/** What a row does to the money both accounts hold. */
const signed = (row: Row) => (row.kind === "income" ? row.amountCents : -row.amountCents)

/** Spend per local calendar day, keyed the way `localDayKey` writes a day. */
function spendByDay(rows: Row[]): Map<string, number> {
  const byDay = new Map<string, number>()
  for (const row of rows) {
    if (!isExpense(row)) continue
    const key = localDayKey(row.at)
    byDay.set(key, (byDay.get(key) ?? 0) + row.amountCents)
  }
  return byDay
}

/** Midnight of the Monday on or before a moment. */
function mondayOnOrBefore(at: number): number {
  const when = new Date(startOfDay(at))
  when.setDate(when.getDate() - ((when.getDay() + 6) % 7))
  return when.getTime()
}

export function heatmapModel(rows: Row[], page: number, now: number, weeks: number = HEAT_WEEKS): HeatmapModel {
  const today = startOfDay(now)
  const anchor = addDays(today, -page * weeks * 7)
  const start = mondayOnOrBefore(addDays(anchor, -(weeks - 1) * 7))
  // The current page ends on today; an earlier one ends on the Sunday of its own last week,
  // which is six days after the anchor. Printing the anchor instead would leave a week of the
  // window out of the dates above it.
  const end = page === 0 ? today : addDays(start, weeks * 7 - 1)
  const byDay = spendByDay(rows)

  const days = Array.from({ length: weeks * 7 }, (_, i) => {
    const at = addDays(start, i)
    const future = page === 0 && at > today
    return { at, future, cents: byDay.get(localDayKey(at)) ?? 0 }
  })

  // The scale is the busiest day the page shows, so the heaviest square is always "the most".
  let max = 0
  for (const day of days) if (!day.future && day.cents > max) max = day.cents

  const cells: HeatCell[] = days.map((day) => ({
    key: localDayKey(day.at),
    at: day.at,
    cents: day.cents,
    future: day.future,
    intensity: day.cents === 0 || max === 0 ? 0 : day.cents / max,
  }))

  let earliest = Number.POSITIVE_INFINITY
  for (const row of rows) if (row.at < earliest) earliest = row.at

  return { cells, start, end, canGoEarlier: earliest < start }
}

/**
 * The money both accounts hold, day by day across the current month. The balance at the
 * end of a day is the openings plus every row up to that day, so the series is built by
 * walking the rows once in time order rather than summing each day from scratch.
 *
 * `openingCents` is handed in by the screen from the same store the dashboard's cards read
 * (`lib/balances.ts`), so the trend and the cards can never disagree — and an account that
 * has no figures of its own opens on zero rather than on the import's total. Omitted, the
 * import's total stands, which is the device ledger's own answer.
 */
export function balanceModel(
  rows: Row[],
  now: number,
  openingCents: number = OPENING_BALANCE_CENTS,
): BalanceModel {
  const monthStart = startOfMonth(now)
  const monthEnd = startOfNextMonth(now)
  const dayCount = Math.round((monthEnd - monthStart) / 86_400_000)
  const days: BalanceModel["days"] = Array.from({ length: dayCount }, (_, i) => ({
    at: addDays(monthStart, i),
    cents: null,
  }))

  const ordered = [...rows].sort((a, b) => a.at - b.at)
  let total = openingCents
  let next = 0
  // Everything before the month is already in the opening of its first day.
  while (next < ordered.length && ordered[next].at < monthStart) total += signed(ordered[next++])

  const today = startOfDay(now)
  let todayIndex = 0
  days.forEach((day, i) => {
    if (day.at > today) return
    const endOfDay = addDays(day.at, 1)
    while (next < ordered.length && ordered[next].at < endOfDay) total += signed(ordered[next++])
    day.cents = total
    todayIndex = i
  })

  const drawn = days.slice(0, todayIndex + 1).map((day) => day.cents as number)
  return { days, today: todayIndex, low: Math.min(...drawn), high: Math.max(...drawn) }
}

export function allocationModel(rows: Row[], now: number): AllocationModel {
  const thisMonth = startOfMonth(now)
  const windows = Array.from({ length: ALLOCATION_MONTHS }, (_, i) => {
    const first = new Date(thisMonth)
    first.setMonth(first.getMonth() - (ALLOCATION_MONTHS - 1 - i))
    const at = first.getTime()
    return {
      at,
      to: startOfNextMonth(at),
      label: first.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
      name: first.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    }
  })

  // Spend per month, per category group.
  const perMonth = windows.map(() => new Map<string, number>())
  const totals = new Map<string, number>()
  rows.forEach((row) => {
    if (!isExpense(row)) return
    const index = windows.findIndex((w) => row.at >= w.at && row.at < w.to)
    if (index < 0) return
    const group = categoryFor(row.category).group
    perMonth[index].set(group, (perMonth[index].get(group) ?? 0) + row.amountCents)
    totals.set(group, (totals.get(group) ?? 0) + row.amountCents)
  })

  // The biggest groups over the whole window get a colour each, in Wallet's own paint.
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([group]) => group)
  const named = ranked.slice(0, TOP_GROUPS)
  const hasOther = ranked.length > TOP_GROUPS
  const segments: AllocationSegment[] = named.map((group) => ({
    key: group,
    label: groupLabel(group),
    color: ALLOCATION_COLOURS[named.indexOf(group)] ?? "var(--ink2)",
  }))
  if (hasOther) segments.push({ key: "other", label: "Other", color: "var(--ink2)" })

  const months = windows.map((window, index): AllocationMonth => {
    const groups = perMonth[index]
    const cents = segments.map((segment) => {
      if (segment.key !== "other") return groups.get(segment.key) ?? 0
      let other = 0
      for (const [group, amount] of groups) if (!named.includes(group)) other += amount
      return other
    })
    let total = 0
    for (const amount of cents) total += amount
    const shares = cents.map((amount) => (total === 0 ? 0 : amount / total))
    const order = segments
      .map((_, k) => k)
      .filter((k) => cents[k] > 0)
      .sort((a, b) => cents[b] - cents[a] || a - b)
    return { at: window.at, label: window.label, name: window.name, cents, total, shares, order }
  })

  return { months, segments }
}

/**
 * The dial: one month of spending at a time, against the owner's total-spending budget, and
 * the months there are to turn back through.
 *
 * This is deliberately **not** one of the dashboard's envelopes. The dashboard's carousel
 * tracks whatever each envelope is about — the first is Food & Beverages out of ₹1,500 —
 * while this dial is the whole month out of ₹5,000 (`lib/budget.ts` holds both) — so the dial
 * counts each row once, and `GaugeCard` says *Total this month* rather than naming a
 * dimension. Its categories are the owner's too: left alone, "whole month" means every
 * expense; a chosen set means exactly that set. Every limit and every set is editable from
 * the card drawing it, which is why this one is an argument here rather than a constant.
 *
 * The months are the ones with an **expense** logged (income does not make a spending month)
 * plus the current month, oldest first, so the carousel reads forwards in time and opens on
 * the live one. A month with no expense is skipped rather than shown as a ₹0 stop: the card
 * is a history of what was spent, not a calendar with blanks in it.
 */
export function gaugeModel(
  rows: Row[],
  now: number,
  /** The total-spending limit, in paise — the owner's own number (`lib/budget.ts`). */
  totalLimitCents: number = BUDGET_DEFAULTS.total,
  /** What the total budget counts, or `null` for every expense (`lib/budget.ts`). */
  totalCategories: string[] | null = BUDGET_TRACKED_DEFAULTS.total,
): GaugeModel {
  const thisMonth = startOfMonth(now)
  const logged = new Set<number>([thisMonth])
  for (const row of rows) if (isExpense(row)) logged.add(startOfMonth(row.at))

  const thisYear = new Date(thisMonth).getFullYear()
  const months = [...logged]
    .sort((a, b) => a - b)
    .map((at): GaugeMonth => {
      const first = new Date(at)
      const short = first.toLocaleDateString("en-US", { month: "short" })
      // A month from another year keeps its year on the pill; twelve `JAN`s in a row would
      // otherwise be indistinguishable.
      const year = first.getFullYear() === thisYear ? null : ` ’${String(first.getFullYear()).slice(-2)}`
      return {
        at,
        short: `${short}${year ?? ""}`.toUpperCase(),
        name: short,
        label: first.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        cents: budgetSpent(rows, at, startOfNextMonth(at), totalCategories),
      }
    })

  return { months, target: totalLimitCents }
}
