import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatMoney, formatTodayLong } from '../lib/format'
import {
  DEFAULT_CURRENCY,
  isIncome,
  OPENING_BALANCE_CENTS,
  type Expense,
} from '../lib/types'

/**
 * Statistics — the rail's second tab, ported from the mockup (`renderStatistics`,
 * `renderTrendChips`, `dailyBalances`, `drawTrend`, `gridValues`, `tickIndexes`
 * and `axisMoney` there).
 *
 * The screen is the reference's savings anatomy rather than its pots: the
 * dashboard's own greeting header, the title, a chip per month the data covers,
 * one figure over one label, and the line in a card of the reference's tan. The
 * line is the balance at the end of every day — the same money Home leads with,
 * so the two can never disagree, and a fall in the line is a day that spent more
 * than it took in.
 */

/** Every month, or one month of the data's own history. */
const TREND_ALL = 'all'

/** A local calendar date as `YYYY-MM-DD`; `toISOString` would shift the day. */
function isoOf(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10)
}

function todayISO(): string {
  return isoOf(new Date())
}

function shiftDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/**
 * The plot's own labels, in the reference's own abbreviations. `en-US` is
 * deliberate here: the axis reads `Oct 1`, and the app's row-level date helper
 * spells a day out instead ("1 Oct 2026") because a row has room for it.
 */
const shortDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** The spelled-out day the plot ends on, for the canvas' screen-reader label. */
const longDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

/**
 * An axis label is money too, so it is rupees — shortened, because a full
 * ₹1,23,456.78 beside every dashed line is wider than the plot it names. This is
 * the one place money is printed by hand, and it only ever shortens what
 * `formatMoney` would say.
 */
function axisMoney(cents: number): string {
  const rupees = Math.abs(cents) / 100
  if (rupees >= 100000) return `₹${(cents / 10000000).toFixed(1)}L`
  if (rupees >= 1000) return `₹${(cents / 100000).toFixed(1)}K`
  return `₹${Math.round(cents / 100)}`
}

/** The dashed rounds sit on round rupees: three or four across the window's range. */
function gridValues(min: number, max: number): number[] {
  const steps = [500000, 200000, 100000, 50000, 20000, 10000, 5000]
  const span = Math.max(max - min, 1)
  const step = steps.find((candidate) => candidate <= span / 2.5) ?? 5000
  const values: number[] = []
  for (let value = Math.ceil(min / step) * step; value <= max; value += step) values.push(value)
  return values
}

/** About six day labels, and always the last one — which is today, or the window's end. */
function tickIndexes(count: number): number[] {
  const every = Math.max(1, Math.round(count / 6))
  const indexes: number[] = []
  for (let index = 0; index < count; index += every) indexes.push(index)
  if (indexes[indexes.length - 1] !== count - 1) indexes.push(count - 1)
  return indexes
}

type Point = { iso: string; cents: number }

/**
 * The balance at the end of every day, from the first entry to today: the
 * opening balance, then each day's own money in and out. An account model does
 * not exist in the app yet, so this opens from the one opening balance the
 * domain has (`OPENING_BALANCE_CENTS`) rather than the mockup's two accounts —
 * when accounts arrive, the seed becomes their sum and nothing else moves.
 */
function dailyBalances(expenses: Expense[], toIso: string): Point[] {
  const netByDay = new Map<string, number>()
  for (const row of expenses) {
    const net = netByDay.get(row.spentAt) ?? 0
    netByDay.set(row.spentAt, net + (isIncome(row) ? row.amountCents : -row.amountCents))
  }

  const first = expenses.reduce(
    (oldest, row) => (row.spentAt < oldest ? row.spentAt : oldest),
    toIso,
  )

  let running = OPENING_BALANCE_CENTS
  const series: Point[] = []
  for (let day = new Date(`${first}T00:00:00`); isoOf(day) <= toIso; day = shiftDays(day, 1)) {
    const iso = isoOf(day)
    running += netByDay.get(iso) ?? 0
    series.push({ iso, cents: running })
  }
  return series
}

/**
 * The figure, with the paise dimmed the way the reference prints money: every
 * part up to the decimal separator is plain text and the fraction sits in a
 * span. `formatToParts` is what keeps that locale-proof — the app prints rupees
 * with the device's own grouping, so the separator is not assumed to be a dot.
 */
function MoneyFigure({ cents, currency }: { cents: number; currency: string }) {
  const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(
    cents / 100,
  )
  const cut = parts.findIndex((part) => part.type === 'decimal')
  const head = parts
    .slice(0, cut < 0 ? parts.length : cut)
    .map((part) => part.value)
    .join('')
  const tail = cut < 0 ? '' : parts.slice(cut).map((part) => part.value).join('')

  return (
    <div className="trend-today__figure">
      {head}
      {tail !== '' && <span>{tail}</span>}
    </div>
  )
}

export function StatisticsScreen({ expenses }: { expenses: Expense[] }) {
  const currency = expenses[0]?.currency ?? DEFAULT_CURRENCY

  // The chip the line is drawn for. It starts on the month today sits in, which
  // is the month the dashboard's list is showing.
  const [trendMonth, setTrendMonth] = useState(() => todayISO().slice(0, 7))

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)

  const all = useMemo(() => dailyBalances(expenses, todayISO()), [expenses])
  const months = useMemo(
    () => [...new Set(all.map((point) => point.iso.slice(0, 7)))],
    [all],
  )

  const shown = useMemo(() => {
    const points = all.filter(
      (point) => trendMonth === TREND_ALL || point.iso.slice(0, 7) === trendMonth,
    )
    // Every chip names a month the data covers, so this is never empty — but a
    // screen with no figure on it would be worse than one that repeats itself.
    return points.length ? points : all
  }, [all, trendMonth])

  const monthOfToday = todayISO().slice(0, 7)
  const endsToday = shown[shown.length - 1]?.iso === todayISO()
  const last = shown[shown.length - 1] ?? { iso: todayISO(), cents: OPENING_BALANCE_CENTS }
  const values = shown.map((point) => point.cents)
  const min = values.length ? Math.min(...values) : last.cents
  const max = values.length ? Math.max(...values) : last.cents

  // The same label the reference prints over the figure, told the truth: a
  // closed month's closing balance is not "current".
  const windowLabel =
    trendMonth === TREND_ALL || trendMonth === monthOfToday
      ? 'Current balance'
      : `${new Date(`${trendMonth}-01T00:00:00`).toLocaleDateString('en-US', {
          month: 'long',
        })} balance`

  /**
   * The plot is pixels, so it is drawn, not laid out: sized for the device pixel
   * ratio like the ring and the pie, and redrawn whenever the window or the
   * element's width changes.
   */
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const rect = canvas?.getBoundingClientRect()
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !rect || !rect.width || !rect.height) return

    const dpr = window.devicePixelRatio || 1
    const width = Math.round(rect.width * dpr)
    const height = Math.round(rect.height * dpr)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    ctx.clearRect(0, 0, width, height)
    if (shown.length < 2) return

    const span = Math.max(max - min, 1)
    const xOf = (index: number) => (index / (shown.length - 1)) * width
    const yOf = (cents: number) => height - ((cents - min) / span) * height

    // One faint upright per day, the way the reference rules its plot. Every ink
    // here is the tan card's own dark brown rather than the page's white: the
    // plot sits on light material, so what it draws has to be dark.
    ctx.lineWidth = dpr
    ctx.strokeStyle = 'rgba(43, 30, 13, 0.07)'
    ctx.beginPath()
    shown.forEach((_point, index) => {
      const x = Math.round(xOf(index)) + 0.5 * dpr
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
    })
    ctx.stroke()

    // The rounds the labels name, dashed so they stay behind the line.
    ctx.setLineDash([5 * dpr, 5 * dpr])
    ctx.strokeStyle = 'rgba(43, 30, 13, 0.18)'
    ctx.beginPath()
    for (const value of gridValues(min, max)) {
      const y = Math.round(yOf(value)) + 0.5 * dpr
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
    }
    ctx.stroke()
    ctx.setLineDash([])

    const trace = () => {
      ctx.beginPath()
      shown.forEach((point, index) => {
        const x = xOf(index)
        const y = yOf(point.cents)
        if (index === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
    }

    // The money under the line, then the line itself, in the card's dark gold.
    const fill = ctx.createLinearGradient(0, 0, 0, height)
    fill.addColorStop(0, 'rgba(109, 85, 39, 0.26)')
    fill.addColorStop(1, 'rgba(109, 85, 39, 0.02)')
    trace()
    ctx.lineTo(width, height)
    ctx.lineTo(0, height)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()

    trace()
    ctx.strokeStyle = '#6d5527'
    ctx.lineWidth = 2 * dpr
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()
  }, [shown, min, max])

  useEffect(() => {
    draw()
  }, [draw])

  // The panel can be resized under the phone, and the canvas is a texture of its
  // box, so it follows the box rather than only the data.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => draw())
    observer.observe(frame)
    return () => observer.disconnect()
  }, [draw])

  return (
    <>
      <div className="header">
        <div className="user-info">
          <div className="brand-badge" aria-hidden="true">
            <svg
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <path d="M16 7h6v6" />
              <path d="m22 7-8.5 8.5-5-5L2 17" />
            </svg>
          </div>
          <div className="greeting">
            <h1>Hi, Priyansh</h1>
            <p className="greeting-date">{formatTodayLong()}</p>
          </div>
        </div>
        <button type="button" className="icon-btn" title="Cards" aria-label="Cards">
          <svg
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
            <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
          </svg>
        </button>
      </div>

      <h1 className="screen-title">Statistics</h1>

      <div className="month-chips" role="group" aria-label="Range">
        {months.map((key) => (
          <button
            key={key}
            type="button"
            className={`month-chip${key === trendMonth ? ' active' : ''}`}
            aria-pressed={key === trendMonth}
            onClick={() => setTrendMonth(key)}
          >
            {new Date(`${key}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short' })}
          </button>
        ))}
        <button
          type="button"
          className={`month-chip${trendMonth === TREND_ALL ? ' active' : ''}`}
          aria-pressed={trendMonth === TREND_ALL}
          onClick={() => setTrendMonth(TREND_ALL)}
        >
          All time
        </button>
      </div>

      <div className="trend-today">
        <div className="trend-today__label">{windowLabel}</div>
        <MoneyFigure cents={last.cents} currency={currency} />
      </div>

      <div className="stat-card stat-card--tan">
        <div className="stat-card__head">
          <h2 className="stat-card__title">Balance trend</h2>
        </div>

        <div className="trend">
          <div className="trend__axis" aria-hidden="true">
            {gridValues(min, max).map((value) => (
              <span
                key={value}
                className="trend__tick"
                style={{ bottom: `${(((value - min) / Math.max(max - min, 1)) * 100).toFixed(2)}%` }}
              >
                {axisMoney(value)}
              </span>
            ))}
          </div>
          <div className="trend__frame" ref={frameRef}>
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`${shown.length} days to ${longDate(last.iso)}: low ${formatMoney(
                min,
                currency,
              )}, high ${formatMoney(max, currency)}, now ${formatMoney(last.cents, currency)}`}
            />
            <div className="trend__days" aria-hidden="true">
              {tickIndexes(shown.length).map((index) => (
                <span className="trend__day" key={index}>
                  {index === shown.length - 1 && endsToday ? 'Today' : shortDate(shown[index].iso)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="trend__legend">
          <span className="trend__swatch" aria-hidden="true" />
          Total balance
        </div>
      </div>
    </>
  )
}
