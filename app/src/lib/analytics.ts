import { OPENING_BALANCE_CENTS } from "./accounts"
import { categoryFor, groupLabel } from "./categories"
import { MONTHLY_BUDGET_CENTS } from "./derive"
import { addDays, localDayKey, startOfDay, startOfMonth, startOfNextMonth } from "./format"
import type { Row } from "./types"

/**
 * The analytics screen's figures, derived from the owner's rows the way the dashboard and
 * the ledger are. The spend figures count expenses only; the balance is what both accounts
 * hold together, which is income and expense alike.
 */

/** The heatmap's window: ten weeks, which is what fits beside the gauge. */
export const HEAT_WEEKS = 10
/** The allocation's window: the months it stacks, ending this one. */
export const ALLOCATION_MONTHS = 12
/** How many groups get their own colour in the allocation; the rest are one grey band. */
const TOP_GROUPS = 4

/**
 * The allocation's colours: the app's own muted data tokens, not Wallet's saturated group paint.
 * The biggest groups take these in order; everything past them is "Other".
 */
const ALLOCATION_COLOURS = [
  "var(--data-red)",
  "var(--data-gold)",
  "var(--data-teal)",
  "color-mix(in oklab, var(--ink) 55%, var(--card))",
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
  /** `HEAT_WEEKS` × 7 cells, a week to a column, Monday first. */
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
 */
export function balanceModel(rows: Row[], now: number): BalanceModel {
  const monthStart = startOfMonth(now)
  const monthEnd = startOfNextMonth(now)
  const dayCount = Math.round((monthEnd - monthStart) / 86_400_000)
  const days: BalanceModel["days"] = Array.from({ length: dayCount }, (_, i) => ({
    at: addDays(monthStart, i),
    cents: null,
  }))

  const ordered = [...rows].sort((a, b) => a.at - b.at)
  let total = OPENING_BALANCE_CENTS
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
    color: ALLOCATION_COLOURS[named.indexOf(group)] ?? "var(--ink2)",
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
