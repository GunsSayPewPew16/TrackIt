import { useMemo, useState } from 'react'
import {
  currentDayOfMonth,
  currentMonthKey,
  formatDayLabel,
  formatMoney,
  formatMonthLabel,
  monthKey,
} from '../lib/format'
import {
  categoryFor,
  DEFAULT_CURRENCY,
  groupFor,
  isIncome,
  OPENING_BALANCE_CENTS,
  type Expense,
} from '../lib/types'
import { CategoryIcon } from '../lib/icons'
import { NEUTRAL_COLOR } from '../lib/markers'
import { ReceiptIcon } from '../lib/ui-icons'
import { ExpenseRow } from './ExpenseRow'

/** Home is a glance, not a ledger: the newest entries, the rest a tap away. */
const HOME_LIST_LIMIT = 5

type Props = {
  expenses: Expense[]
  loading: boolean
  onDelete: (id: string) => void
}

export function HomeScreen({ expenses, loading, onDelete }: Props) {
  const month = currentMonthKey()
  const [showAll, setShowAll] = useState(false)

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

    // Money in the accounts: the opening balances, plus income, minus spending.
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

  // Capped by row, not by day, so "the last five" means five rows on screen.
  const visible = useMemo(
    () => (showAll ? expenses : expenses.slice(0, HOME_LIST_LIMIT)),
    [expenses, showAll],
  )

  const groups = useMemo(() => {
    const map = new Map<string, Expense[]>()
    for (const item of visible) {
      const bucket = map.get(item.spentAt)
      if (bucket) bucket.push(item)
      else map.set(item.spentAt, [item])
    }
    return [...map.entries()]
  }, [visible])

  const currency = expenses[0]?.currency ?? DEFAULT_CURRENCY

  return (
    <>
      <header className="app-header">
        <h1 className="app-header__title">TrackIt</h1>
        <p className="app-header__subtitle">{formatMonthLabel(month)}</p>
      </header>

      <main className="screen">
        <section className="card summary">
          <div>
            <div className="summary__label">Total balance</div>
            <div className="summary__amount">{formatMoney(balance, currency)}</div>
          </div>

          <div className="summary__spent">
            <span className="summary__spent-label">Spent this month</span>
            <span className="summary__spent-value">{formatMoney(total, currency)}</span>
          </div>

          <div className="summary__meta">
            <div>
              <strong>{monthCount}</strong>
              expenses
            </div>
            <div>
              <strong>{formatMoney(dailyAverage, currency)}</strong>
              per day
            </div>
            <div>
              <strong>{byCategory.length}</strong>
              categories
            </div>
          </div>

          {byCategory.length > 0 && (
            <div className="breakdown">
              {byCategory.slice(0, 4).map(([id, amount]) => {
                const category = categoryFor(id)
                const percent = total > 0 ? Math.round((amount / total) * 100) : 0
                return (
                  <div className="breakdown__row" key={id}>
                    <span className="breakdown__label">
                      <CategoryIcon
                        id={category.id}
                        className="breakdown__icon"
                        color={groupFor(category.id)?.color ?? NEUTRAL_COLOR}
                      />
                      {category.label}
                    </span>
                    <span>{formatMoney(amount, currency)}</span>
                    <div className="breakdown__bar">
                      <div className="breakdown__fill" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {expenses.length === 0 ? (
          loading ? null : (
            <div className="empty">
              <span className="empty__icon" aria-hidden>
                <ReceiptIcon />
              </span>
              <p className="empty__title">No expenses yet</p>
              <p>Tap + to log your first one.</p>
            </div>
          )
        ) : (
          <>
            {groups.map(([day, items]) => (
              <div className="day-group" key={day}>
                <h2 className="section-title">{formatDayLabel(day)}</h2>
                <div className="list">
                  {items.map((item) => (
                    <ExpenseRow
                      key={item.id}
                      expense={item}
                      fallbackCurrency={currency}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              </div>
            ))}

            {expenses.length > HOME_LIST_LIMIT && (
              <button
                type="button"
                className="list-more"
                onClick={() => setShowAll((value) => !value)}
                aria-expanded={showAll}
              >
                {showAll ? 'Show fewer' : `Show all ${expenses.length} entries`}
              </button>
            )}
          </>
        )}
      </main>
    </>
  )
}
