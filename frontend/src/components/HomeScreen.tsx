import { useEffect, useMemo, useRef, useState } from 'react'
import {
  currentDayOfMonth,
  currentMonthKey,
  formatDayLabel,
  formatMoney,
  formatMonthLabel,
  formatTodayLong,
  monthKey,
  todayISO,
} from '../lib/format'
import { CategoryIcon } from '../lib/icons'
import { NEUTRAL_COLOR } from '../lib/markers'
import {
  categoryFor,
  DEFAULT_CURRENCY,
  groupFor,
  isIncome,
  MONTHLY_BUDGET_CENTS,
  OPENING_BALANCE_CENTS,
  type Expense,
} from '../lib/types'

/**
 * Home, in the design the mockup agreed on: the greeting header, the balance as
 * a gold rupee coin over the figure, one account card in the owner's own metal,
 * the Transfer/Request pair and the two budget widgets.
 *
 * The rows used to be listed here too. They are not any more: the dashboard is
 * a glance at the money, and the day-by-day ledger is Financial Operations,
 * one tap away behind the button where the list was.
 *
 * The anatomy is the mockup's; the numbers are the app's. The one place the app
 * has less to say than the mockup did is the card: the mockup has two accounts
 * and swipes between them, and this app's rows carry no account, so there is one
 * card and no dots. When accounts land, the slide becomes a carousel and nothing
 * else on this screen moves.
 */

/** How many category slices the pie names before it says "Everything else". */
const PIE_WEDGES = 4

type Props = {
  expenses: Expense[]
  onSync: () => Promise<unknown>
  /** Open the scanner: the Transfer button's job in this app. */
  onScan: () => void
  /** Open the Financial Operations page — the balance figure's and the
      records button's job, since both go to the same ledger. */
  onOperations: () => void
  /** Request has a page of its own now, however empty it is for the moment. */
  onRequest: () => void
  /** The header's wallet button, which the rail also owns. */
  onCards: () => void
}

/**
 * One canvas, sized to its own box and its device pixel ratio, redrawn whenever
 * the numbers behind it change or the box resizes. Returned as a ref because a
 * canvas is only drawable once React has put it in the document.
 */
function useCanvas(
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  deps: unknown[],
) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    const render = () => {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width) return
      const dpr = window.devicePixelRatio || 1
      const size = Math.round(rect.width * dpr)
      if (canvas.width !== size || canvas.height !== size) {
        canvas.width = size
        canvas.height = size
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, size, size)
      draw(ctx, size)
    }

    render()
    const observer = new ResizeObserver(render)
    observer.observe(canvas)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the deps are the caller's
  }, deps)

  return ref
}

/** Rupees and paise, so the paise can be set smaller the way the design does it. */
function splitMoney(formatted: string): [string, string] {
  const cut = formatted.lastIndexOf('.')
  return cut === -1 ? [formatted, ''] : [formatted.slice(0, cut), formatted.slice(cut)]
}

export function HomeScreen({
  expenses,
  onSync,
  onScan,
  onOperations,
  onRequest,
  onCards,
}: Props) {
  const month = currentMonthKey()
  const [syncNote, setSyncNote] = useState('Synced just now')

  const { total, monthCount, byCategory, dailyAverage, balance } = useMemo(() => {
    const inMonth = expenses.filter((item) => monthKey(item.spentAt) === month)
    // Income is listed like anything else but is never spending: it stays out of
    // this month's total, the breakdown, the daily average and the count.
    const spending = inMonth.filter((item) => !isIncome(item))
    const sum = spending.reduce((acc, item) => acc + item.amountCents, 0)

    const totals = new Map<string, number>()
    for (const item of spending) {
      totals.set(item.category, (totals.get(item.category) ?? 0) + item.amountCents)
    }

    // Money in the accounts: the opening balance, plus income, minus spending.
    let received = 0
    let spent = 0
    for (const item of expenses) {
      if (isIncome(item)) received += item.amountCents
      else spent += item.amountCents
    }

    return {
      total: sum,
      monthCount: spending.length,
      byCategory: [...totals.entries()].sort((a, b) => b[1] - a[1]),
      dailyAverage: Math.round(sum / Math.max(currentDayOfMonth(), 1)),
      balance: OPENING_BALANCE_CENTS + received - spent,
    }
  }, [expenses, month])

  const currency = expenses[0]?.currency ?? DEFAULT_CURRENCY
  const budgetUsed = Math.min(total / MONTHLY_BUDGET_CENTS, 1)
  const budgetLeft = Math.max(MONTHLY_BUDGET_CENTS - total, 0)

  // The pie's own slices: the biggest categories by name, the tail summed.
  const pie = useMemo(() => {
    const named = byCategory.slice(0, PIE_WEDGES)
    const rest = byCategory.slice(PIE_WEDGES).reduce((acc, [, cents]) => acc + cents, 0)
    const slices = named.map(([id, cents]) => ({
      id,
      cents,
      color: groupFor(id)?.color ?? NEUTRAL_COLOR,
    }))
    if (rest > 0) slices.push({ id: 'unknown', cents: rest, color: NEUTRAL_COLOR })
    return slices
  }, [byCategory])

  // The ring: one gold arc over a faint track, starting at twelve o'clock.
  const ringRef = useCanvas(
    (ctx, size) => {
      const stroke = size * 0.1
      const radius = (size - stroke) / 2
      ctx.lineWidth = stroke
      ctx.lineCap = 'round'

      ctx.beginPath()
      ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
      ctx.stroke()

      if (budgetUsed <= 0) return
      ctx.beginPath()
      ctx.arc(size / 2, size / 2, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * budgetUsed)
      ctx.strokeStyle = '#f5e79b'
      ctx.stroke()
    },
    [budgetUsed],
  )

  // The pie: one wedge per slice, drawn from the same totals the legend prints.
  const pieRef = useCanvas(
    (ctx, size) => {
      const sum = pie.reduce((acc, slice) => acc + slice.cents, 0)
      if (!sum) return
      const radius = size / 2
      let from = -Math.PI / 2
      for (const slice of pie) {
        const sweep = (slice.cents / sum) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(radius, radius)
        ctx.arc(radius, radius, radius, from, from + sweep)
        ctx.closePath()
        ctx.fillStyle = slice.color
        ctx.fill()
        // A hairline in the card's own colour keeps neighbouring wedges apart
        // when two categories happen to share a colour.
        ctx.strokeStyle = 'rgba(16, 13, 8, 0.55)'
        ctx.lineWidth = Math.max(1, size * 0.006)
        ctx.stroke()
        from += sweep
      }
    },
    [pie],
  )

  async function handleSync() {
    setSyncNote('Syncing…')
    try {
      await onSync()
      setSyncNote('Synced just now')
    } catch (cause) {
      setSyncNote(cause instanceof Error ? cause.message : 'Sync failed')
    }
  }

  const [whole, paise] = splitMoney(formatMoney(balance, currency))
  const [spentWhole, spentPaise] = splitMoney(formatMoney(total, currency))

  return (
    <main className="screen">
      <div className="header">
        <div className="user-info">
          <div className="brand-badge" aria-hidden>
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M16 7h6v6" />
              <path d="m22 7-8.5 8.5-5-5L2 17" />
            </svg>
          </div>
          <div className="greeting">
            <h1>Hi, Priyansh</h1>
            {/* The mockup's fixed date, told the truth: this is today. */}
            <p className="greeting-date">{formatTodayLong()}</p>
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={onCards} title="Cards" aria-label="Cards">
          <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
            <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
          </svg>
        </button>
      </div>

      <div className="sync-status" role="status">
        {syncNote}
      </div>

      <div className="balance-section">
        <div className="balance-title">Total balance</div>
        <div className="balance-row">
          <div className="coin-icon" aria-hidden>
            ₹
          </div>
          <button
            type="button"
            className="balance-open"
            onClick={onOperations}
            title="Money in and out"
            aria-label="Open Financial Operations"
          >
            <span className="balance-amount">
              {whole}
              <span>{paise}</span>
            </span>
            <svg
              className="balance-open__go"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--round balance-sync"
            onClick={handleSync}
            title="Sync with the server"
            aria-label="Sync with the server"
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
          </button>
        </div>
        <div className="balance-second">
          <span className="balance-second__label">Spent this month</span>
          <span className="balance-second__value">
            {spentWhole}
            <span>{spentPaise}</span>
          </span>
        </div>
      </div>

      {/* The owner's own metal, with the veil over it that the design puts
          under the card's ink so a small line of type stays readable. */}
      <div className="acct-carousel">
        <div className="acct-slide">
          <div className="acct-top">
            <span>All accounts</span>
            <span>
              {monthCount} {monthCount === 1 ? 'entry' : 'entries'} this month
            </span>
          </div>
          <div className="acct-figure">
            {whole}
            <span>{paise}</span>
          </div>
          <div className="acct-foot">
            {formatMoney(total, currency)} spent this month ·{' '}
            {formatMoney(dailyAverage, currency)} a day
          </div>
        </div>
      </div>

      <div className="action-row">
        {/* Transfer is the scanner: the owner's plan is to pay from the same
            tap that logs the expense, so the camera is one tap from Home. */}
        <button type="button" className="action-btn btn-transfer" onClick={onScan} title="Scan a UPI code and pay" aria-label="Scan a UPI code and pay">
          <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M8 3 4 7l4 4" />
            <path d="M4 7h16" />
            <path d="m16 21 4-4-4-4" />
            <path d="M20 17H4" />
          </svg>
          Transfer
        </button>
        <button type="button" className="action-btn btn-request" onClick={onRequest} title="Request" aria-label="Request">
          <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
          Request
        </button>
      </div>

      <div className="widgets-grid">
        <div className="widget-card">
          <div className="widget-header">
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            Budget used
          </div>
          <div className="goal-container">
            <canvas ref={ringRef} />
            <div className="goal-text">
              <span className="goal-text__value">{Math.round(budgetUsed * 100)}%</span>
              <span>used</span>
            </div>
          </div>
          <div className="goal-footer">{formatMoney(budgetLeft, currency)} remaining</div>
        </div>

        <div className="widget-card">
          <div className="widget-header">
            <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            {formatMonthLabel(month)} budget
          </div>
          <div className="cat-pie">
            <canvas ref={pieRef} />
          </div>
          <div className="cat-legend">
            {pie.map((slice) => {
              const category = categoryFor(slice.id)
              return (
                <div className="cat-legend__row" key={slice.id}>
                  <CategoryIcon id={category.id} className="cat-legend__icon" color={slice.color} />
                  <span className="cat-legend__name">{category.label}</span>
                  <span className="cat-legend__amount">{formatMoney(slice.cents, currency)}</span>
                </div>
              )
            })}
          </div>
          <div className="goal-footer">
            {formatMoney(total, currency)} of {formatMoney(MONTHLY_BUDGET_CENTS, currency)}
          </div>
        </div>
      </div>

      {/* Where the newest rows used to be listed. They live behind this
          button now: the dashboard stays a glance at the money, and the
          day-by-day ledger is one tap away. */}
      <button
        type="button"
        className="records-open"
        onClick={onOperations}
        title="Financial operations"
        aria-label="Open Financial operations"
      >
        <svg
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h10" />
        </svg>
        Financial operations
      </button>

      {/* The date Home is built around, in the mockup's own words. */}
      <p className="goal-footer">{formatDayLabel(todayISO())} · {formatMonthLabel(month)}</p>
    </main>
  )
}
