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

/** The heatmap's window: ten weeks, which is what fits beside the gauge. */
export const HEAT_WEEKS = 10
/** The expanded daily-spend view: nine weeks, about two months, drawn with wider squares. */
export const SHEET_WEEKS = 9
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
  /** Midnight of the first cell and of the last day the window shows. */
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

export interface GaugeModel {
  /**
   * Every expense this month and last, in paise, whatever its category: the dial answers
   * "what has the month cost me?", which is the whole of the spending and not one dimension.
   */
  thisMonth: number
  lastMonth: number
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
  const end = addDays(today, -page * weeks * 7)
  const start = mondayOnOrBefore(addDays(end, -(weeks - 1) * 7))
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
 * The dial: every expense the month has taken, and the same for the month before it, against
 * the owner's total-spending budget.
 *
 * This is deliberately **not** the dashboard's envelope card. The two cards track two
 * different things — the card on the dashboard is Food & Beverages out of ₹1,500, and this
 * dial is the whole month out of ₹5,000 (`lib/budget.ts` holds both) — so the dial counts
 * each row once, and `GaugeCard` says *Total this month* rather than naming a dimension.
 * Its categories are the owner's too: left alone, "whole month" means every expense; a
 * chosen set means exactly that set. Both limits and both sets are editable from the card
 * drawing them, which is why both are arguments here rather than constants.
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
  const lastMonth = startOfMonth(addDays(thisMonth, -1))
  return {
    thisMonth: budgetSpent(rows, thisMonth, startOfNextMonth(now), totalCategories),
    lastMonth: budgetSpent(rows, lastMonth, thisMonth, totalCategories),
    target: totalLimitCents,
  }
}
