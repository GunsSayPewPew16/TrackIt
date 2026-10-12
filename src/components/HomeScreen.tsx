import { useMemo } from 'react'
import {
  currentDayOfMonth,
  currentMonthKey,
  formatDayLabel,
  formatMoney,
  formatMonthLabel,
  monthKey,
} from '../lib/format'
import { categoryFor, DEFAULT_CURRENCY, type Expense } from '../lib/types'
import { ExpenseRow } from './ExpenseRow'

type Props = {
  expenses: Expense[]
  loading: boolean
  onDelete: (id: string) => void
}

export function HomeScreen({ expenses, loading, onDelete }: Props) {
  const month = currentMonthKey()

  const { total, monthCount, byCategory, dailyAverage } = useMemo(() => {
    const inMonth = expenses.filter((item) => monthKey(item.spentAt) === month)
    const sum = inMonth.reduce((acc, item) => acc + item.amountCents, 0)

    const totals = new Map<string, number>()
    for (const item of inMonth) {
      totals.set(item.category, (totals.get(item.category) ?? 0) + item.amountCents)
    }
    return {
      total: sum,
      monthCount: inMonth.length,
      byCategory: [...totals.entries()].sort((a, b) => b[1] - a[1]),
      dailyAverage: Math.round(sum / Math.max(currentDayOfMonth(), 1)),
    }
  }, [expenses, month])

  const groups = useMemo(() => {
    const map = new Map<string, Expense[]>()
    for (const item of expenses) {
      const bucket = map.get(item.spentAt)
      if (bucket) bucket.push(item)
      else map.set(item.spentAt, [item])
    }
    return [...map.entries()]
  }, [expenses])

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
            <div className="summary__label">Spent this month</div>
            <div className="summary__amount">{formatMoney(total, currency)}</div>
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
                    <span>
                      {category.emoji} {category.label}
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
              <span className="empty__emoji" aria-hidden>
                💸
              </span>
              <p className="empty__title">No expenses yet</p>
              <p>Tap + to log your first one.</p>
            </div>
          )
        ) : (
          groups.map(([day, items]) => (
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
          ))
        )}
      </main>
    </>
  )
}
