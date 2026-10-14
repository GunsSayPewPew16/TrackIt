import { useEffect, useMemo, useRef, useState } from 'react'
import { formatLongDate, formatMoney } from '../lib/format'
import { CategoryIcon } from '../lib/icons'
import { markerStyle } from '../lib/markers'
import { categoryFor, DEFAULT_CURRENCY, isIncome, type Expense } from '../lib/types'

/**
 * Financial Operations — the page over the phone that the dashboard's balance
 * opens, ported from the mockup (`renderCalendar`, `renderRecords`, `rangeLabel`,
 * `weekRange`, `monthRange`, `currentRange` and the `.records-overlay` markup).
 *
 * It is still a date-filtered view of the one dataset rather than a bank ledger:
 * the filter cycles Day → Week → Month, the back arrow is the way out, and the
 * two money-movement pills are named and shaped but answer nothing yet — the
 * owner is wiring them to UPI, and a control that pretended to move money would
 * be worse than one that waits.
 */

type RangeMode = 'day' | 'week' | 'month'

const RANGE_MODES: RangeMode[] = ['day', 'week', 'month']
const RANGE_NAME: Record<RangeMode, string> = { day: 'Day', week: 'Week', month: 'Month' }
const RANGE_EMPTY: Record<RangeMode, string> = {
  day: 'Nothing on this day',
  week: 'Nothing in this week',
  month: 'Nothing in this month',
}

/** The week of pills under the pills: seven days, ending on today. */
const OPS_WINDOW_DAYS = 7

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

const shortDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** The calendar week (Sunday-first) or month containing a date. */
function weekRange(iso: string): { start: string; end: string } {
  const day = new Date(`${iso}T00:00:00`)
  const sunday = shiftDays(day, -day.getDay())
  return { start: isoOf(sunday), end: isoOf(shiftDays(sunday, 6)) }
}

function monthRange(iso: string): { start: string; end: string } {
  const day = new Date(`${iso}T00:00:00`)
  return {
    start: isoOf(new Date(day.getFullYear(), day.getMonth(), 1)),
    end: isoOf(new Date(day.getFullYear(), day.getMonth() + 1, 0)),
  }
}

/** The reference's anatomy: the tile, what it was, the day, and what it cost. */
function OpsRow({ expense, currency }: { expense: Expense; currency: string }) {
  const category = categoryFor(expense.category)
  const income = isIncome(expense)
  const label = expense.note || category.label

  return (
    <div className="expense-row">
      <span className="expense-row__marker" style={markerStyle()} aria-hidden>
        <CategoryIcon id={category.id} />
      </span>
      <div className="expense-row__main">
        <div className="expense-row__title">{label}</div>
        {/* The tile already says the category, so this line says the day. */}
        <div className="expense-row__sub">{formatLongDate(expense.spentAt)}</div>
      </div>
      <span
        className={`expense-row__amount expense-row__amount--${income ? 'income' : 'expense'}`}
      >
        {income ? '+' : '−'}
        {formatMoney(expense.amountCents, expense.currency || currency)}
      </span>
    </div>
  )
}

type Props = {
  expenses: Expense[]
  onClose: () => void
  onTransfer: () => void
  onAdd: () => void
}

export function OperationsScreen({ expenses, onClose, onTransfer, onAdd }: Props) {
  const currency = expenses[0]?.currency ?? DEFAULT_CURRENCY
  const overlayRef = useRef<HTMLElement | null>(null)

  // The page opens on the newest day the data actually has: today is often a day
  // the import says nothing about, and a ledger that greets the owner with an
  // empty day reads as broken. Any day they pick is what they get from then on.
  const [selectedDate, setSelectedDate] = useState(() => {
    const newest = expenses.reduce(
      (latest, expense) => (expense.spentAt > latest ? expense.spentAt : latest),
      '',
    )
    return newest || todayISO()
  })
  const [rangeMode, setRangeMode] = useState<RangeMode>('day')

  const range = useMemo(() => {
    if (rangeMode === 'week') return weekRange(selectedDate)
    if (rangeMode === 'month') return monthRange(selectedDate)
    return { start: selectedDate, end: selectedDate }
  }, [rangeMode, selectedDate])

  const rangeLabel =
    rangeMode === 'week'
      ? `${shortDate(range.start)} – ${shortDate(range.end)}`
      : rangeMode === 'month'
        ? new Date(`${range.start}T00:00:00`).toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          })
        : new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })

  const inRange = useMemo(
    () =>
      expenses
        .filter((expense) => expense.spentAt >= range.start && expense.spentAt <= range.end)
        // Newest first, whatever order the caller handed them over in.
        .sort((a, b) => (a.spentAt === b.spentAt ? b.createdAt.localeCompare(a.createdAt) : b.spentAt.localeCompare(a.spentAt))),
    [expenses, range],
  )

  // The strip is built from today backwards, so it is always the same seven pills.
  const windowDays = useMemo(() => {
    const days: Date[] = []
    const today = new Date(`${todayISO()}T00:00:00`)
    for (let back = OPS_WINDOW_DAYS - 1; back >= 0; back -= 1) days.push(shiftDays(today, -back))
    return days
  }, [])

  // The strip's own day pills only reach back a week, so a ledger opened on an
  // older entry shows the range it is in rather than nothing.
  const groups = useMemo(() => {
    if (rangeMode === 'day') return null
    const map = new Map<string, Expense[]>()
    for (const expense of inRange) {
      const bucket = map.get(expense.spentAt)
      if (bucket) bucket.push(expense)
      else map.set(expense.spentAt, [expense])
    }
    return [...map.entries()]
  }, [inRange, rangeMode])

  const spent = inRange.filter((expense) => !isIncome(expense))
  const received = inRange.filter(isIncome)
  const summary = received.length
    ? `${inRange.length} entries · spent ${formatMoney(
        spent.reduce((sum, expense) => sum + expense.amountCents, 0),
        currency,
      )} · in ${formatMoney(
        received.reduce((sum, expense) => sum + expense.amountCents, 0),
        currency,
      )}`
    : `${spent.length} ${spent.length === 1 ? 'expense' : 'expenses'} · ${formatMoney(
        spent.reduce((sum, expense) => sum + expense.amountCents, 0),
        currency,
      )}`

  // Built before it is ever shown, and landed at the top of itself.
  useEffect(() => {
    if (overlayRef.current) overlayRef.current.scrollTop = 0
  }, [])

  // The page is a page, not a tab: escape is the other way out, beside its back
  // arrow. The listener is on the document because nothing inside it holds focus.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <section className="records-overlay is-open" ref={overlayRef} aria-label="Financial Operations">
      <div className="ops-header">
        <button
          type="button"
          className="icon-btn icon-btn--round"
          title="Back"
          aria-label="Back"
          onClick={onClose}
        >
          <svg
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
        </button>
        <button type="button" className="icon-btn" title="Menu" aria-label="Menu">
          <svg
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </button>
      </div>

      <h1 className="screen-title">
        Financial
        <br />
        Operations
      </h1>

      {/* The reference's three controls: the money-movement pair and the gold add. */}
      <div className="ops-actions">
        <button
          type="button"
          className="ops-pill ops-pill--transfer"
          title="Transfer"
          aria-label="Transfer"
          onClick={onTransfer}
        >
          <svg
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <path d="M8 3 4 7l4 4" />
            <path d="M4 7h16" />
            <path d="m16 21 4-4-4-4" />
            <path d="M20 17H4" />
          </svg>
          Transfer
        </button>
        <button
          type="button"
          className="ops-pill ops-pill--request"
          title="Request"
          aria-label="Request"
        >
          <svg
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
          Request
        </button>
        <button
          type="button"
          className="ops-pill ops-pill--add"
          title="Add expense"
          aria-label="Add expense"
          onClick={onAdd}
        >
          <svg
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
        </button>
      </div>

      {/* Seven days always fit, so this never becomes a scroll container. */}
      <div className="calendar-strip">
        {windowDays.map((day) => {
          const iso = isoOf(day)
          const active = iso === selectedDate
          const inRangeDay = !active && iso >= range.start && iso <= range.end
          return (
            <button
              key={iso}
              type="button"
              className={`cal-day${active ? ' active' : ''}${inRangeDay ? ' in-range' : ''}`}
              aria-pressed={active}
              onClick={() => setSelectedDate(iso)}
            >
              <span>{day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</span>
              <span className="cal-date">{day.getDate()}</span>
            </button>
          )
        })}
      </div>

      <div className="section-header">
        <div className="date-indicator">
          <svg
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <path d="M8 2v3" />
            <path d="M16 2v3" />
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
          </svg>
          <span>{rangeLabel}</span>
        </div>
        <button
          type="button"
          className="icon-btn icon-btn--sm range-toggle"
          aria-label="Change range"
          onClick={() =>
            setRangeMode((mode) => RANGE_MODES[(RANGE_MODES.indexOf(mode) + 1) % RANGE_MODES.length])
          }
        >
          <svg
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <path d="M10 8h4" />
            <path d="M12 21v-9" />
            <path d="M12 8V3" />
            <path d="M17 16h4" />
            <path d="M19 12V3" />
            <path d="M19 21v-5" />
            <path d="M3 14h4" />
            <path d="M5 10V3" />
            <path d="M5 21v-7" />
          </svg>
          <span>{RANGE_NAME[rangeMode]}</span>
        </button>
      </div>

      <div className="ops-list">
        {inRange.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__title">{RANGE_EMPTY[rangeMode]}</span>
            <span className="empty-state__note">Add one and it shows here and on Home.</span>
          </div>
        ) : (
          <>
            {groups
              ? groups.map(([day, items]) => (
                  <div key={day}>
                    {/* The day already says when; the rows inside say what. */}
                    <div className="day-label">
                      {new Date(`${day}T00:00:00`).toLocaleDateString('en-US', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </div>
                    <div className="tx-list">
                      {items.map((expense) => (
                        <OpsRow key={expense.id} expense={expense} currency={currency} />
                      ))}
                    </div>
                  </div>
                ))
              : (
                  <div className="tx-list">
                    {inRange.map((expense) => (
                      <OpsRow key={expense.id} expense={expense} currency={currency} />
                    ))}
                  </div>
                )}
            {/* Spending and income are both listed, but only spending is a total. */}
            <div className="ops-total">{summary}</div>
          </>
        )}
      </div>
    </section>
  )
}
