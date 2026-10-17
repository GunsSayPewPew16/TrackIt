import { CATEGORY_GROUPS, categoryFor, groupLabel } from "./categories"
import { MONTHLY_BUDGET_CENTS } from "./derive"
import { addDays, localDayKey, startOfDay, startOfMonth, startOfNextMonth } from "./format"
import type { Row } from "./types"

/**
 * The analytics screen's figures, derived from the owner's rows the way the dashboard and
 * the ledger are. Every figure here is spend: money in is not a bar, a cell or a point.
 */

/** The heatmap's window: the weeks it shows, one page at a time. */
export const HEAT_WEEKS = 21
/** The trend's window: the last few days, ending today. */
export const TREND_DAYS = 12
/** The allocation's window: the months it stacks, ending this one. */
export const ALLOCATION_MONTHS = 12
/** How many groups get their own colour in the allocation; the rest are one grey band. */
const TOP_GROUPS = 4

export type HeatLevel = 0 | 1 | 2 | 3 | 4

export interface HeatCell {
  key: string
  /** Local midnight of the day. */
  at: number
  cents: number
  level: HeatLevel
  /** After today: drawn as nothing at all. Only the newest page can have these. */
  future: boolean
}

export interface HeatmapModel {
  /** `HEAT_WEEKS` × 7 cells, a week to a column, Monday first. */
  cells: HeatCell[]
  /** Midnight of the first cell and of the last day the window shows. */
  start: number
  end: number
  /** Whether any row is older than this window, so an earlier page has something on it. */
  canGoEarlier: boolean
}

export interface TrendModel {
  /** Oldest first, one per day, ending today. */
  days: { at: number; cents: number }[]
  /** The largest day in the window, for the scale. Never zero, so the plot can divide by it. */
  max: number
}

export interface AllocationSegment {
  key: string
  label: string
  color: string
}

export interface AllocationModel {
  /** Oldest month first. `shares` lines up with `segments`, bottom to top, and sums to 1 — or to 0 for a month with no spend. */
  months: { at: number; label: string; shares: number[] }[]
  segments: AllocationSegment[]
}

export interface GaugeModel {
  thisMonth: number
  lastMonth: number
  /** What the gauge measures against: the budget the rest of the app uses. */
  target: number
}

const isExpense = (row: Row) => row.kind === "expense"

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

/** Spend between two instants, half-open, which is how every window in the app is cut. */
function spentBetween(rows: Row[], from: number, to: number): number {
  let total = 0
  for (const row of rows) {
    if (isExpense(row) && row.at >= from && row.at < to) total += row.amountCents
  }
  return total
}

/** Midnight of the Monday on or before a moment. */
function mondayOnOrBefore(at: number): number {
  const when = new Date(startOfDay(at))
  when.setDate(when.getDate() - ((when.getDay() + 6) % 7))
  return when.getTime()
}

export function heatmapModel(rows: Row[], page: number, now: number): HeatmapModel {
  const today = startOfDay(now)
  const end = addDays(today, -page * HEAT_WEEKS * 7)
  const start = mondayOnOrBefore(addDays(end, -(HEAT_WEEKS - 1) * 7))
  const byDay = spendByDay(rows)

  const days = Array.from({ length: HEAT_WEEKS * 7 }, (_, i) => {
    const at = addDays(start, i)
    const future = page === 0 && at > today
    return { at, future, cents: byDay.get(localDayKey(at)) ?? 0 }
  })

  // The scale is the busiest day the page shows, so the darkest cell is always "the most".
  let max = 0
  for (const day of days) if (!day.future && day.cents > max) max = day.cents

  const cells: HeatCell[] = days.map((day) => ({
    key: localDayKey(day.at),
    at: day.at,
    cents: day.cents,
    future: day.future,
    level: day.cents === 0 || max === 0 ? 0 : (Math.min(4, Math.ceil((day.cents / max) * 4)) as HeatLevel),
  }))

  let earliest = Number.POSITIVE_INFINITY
  for (const row of rows) if (row.at < earliest) earliest = row.at

  return { cells, start, end, canGoEarlier: earliest < start }
}

export function trendModel(rows: Row[], now: number): TrendModel {
  const byDay = spendByDay(rows)
  const today = startOfDay(now)
  const days = Array.from({ length: TREND_DAYS }, (_, i) => {
    const at = addDays(today, i - (TREND_DAYS - 1))
    return { at, cents: byDay.get(localDayKey(at)) ?? 0 }
  })
  const max = days.reduce((largest, day) => Math.max(largest, day.cents), 0)
  return { days, max: Math.max(1, max) }
}

export function allocationModel(rows: Row[], now: number): AllocationModel {
  const thisMonth = startOfMonth(now)
  const windows = Array.from({ length: ALLOCATION_MONTHS }, (_, i) => {
    const first = new Date(thisMonth)
    first.setMonth(first.getMonth() - (ALLOCATION_MONTHS - 1 - i))
    const at = first.getTime()
    return { at, to: startOfNextMonth(at), label: first.toLocaleDateString("en-US", { month: "short" }).toUpperCase() }
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
    color: CATEGORY_GROUPS.find((g) => g.id === group)?.color ?? "var(--ink2)",
  }))
  if (hasOther) segments.push({ key: "other", label: "Other", color: "var(--ink2)" })

  const months = windows.map((window, index) => {
    const groups = perMonth[index]
    let monthTotal = 0
    for (const cents of groups.values()) monthTotal += cents
    const shares = segments.map((segment) => {
      if (monthTotal === 0) return 0
      if (segment.key !== "other") return (groups.get(segment.key) ?? 0) / monthTotal
      let other = 0
      for (const [group, cents] of groups) if (!named.includes(group)) other += cents
      return other / monthTotal
    })
    return { at: window.at, label: window.label, shares }
  })

  return { months, segments }
}

export function gaugeModel(rows: Row[], now: number): GaugeModel {
  const thisMonth = startOfMonth(now)
  const lastMonth = startOfMonth(addDays(thisMonth, -1))
  return {
    thisMonth: spentBetween(rows, thisMonth, startOfNextMonth(now)),
    lastMonth: spentBetween(rows, lastMonth, thisMonth),
    target: MONTHLY_BUDGET_CENTS,
  }
}
