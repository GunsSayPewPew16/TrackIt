import { formatMoney } from '../lib/format'
import { categoryFor, type Expense } from '../lib/types'

type Props = {
  expense: Expense
  fallbackCurrency: string
  onDelete: (id: string) => void
}

export function ExpenseRow({ expense, fallbackCurrency, onDelete }: Props) {
  const category = categoryFor(expense.category)
  const label = expense.note || category.label

  function handleDelete() {
    if (window.confirm(`Delete “${label}”?`)) onDelete(expense.id)
  }

  return (
    <div className="expense-row">
      <span className="expense-row__emoji" aria-hidden>
        {category.emoji}
      </span>

      <div className="expense-row__main">
        <div className="expense-row__title">
          {label}
          {expense.source === 'shortcut' && <span className="badge">auto</span>}
        </div>
        <div className="expense-row__sub">
          {expense.source === 'shortcut' ? `${category.label} · imported` : category.label}
        </div>
      </div>

      <span className="expense-row__amount">
        {formatMoney(expense.amountCents, expense.currency || fallbackCurrency)}
      </span>

      <button
        type="button"
        className="row-delete"
        onClick={handleDelete}
        aria-label={`Delete expense: ${label}`}
      >
        ✕
      </button>
    </div>
  )
}
