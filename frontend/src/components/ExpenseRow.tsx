import { formatLongDate, formatMoney } from '../lib/format'
import { CategoryIcon } from '../lib/icons'
import { markerStyle } from '../lib/markers'
import { categoryFor, isIncome, type Expense } from '../lib/types'
import { XIcon } from '../lib/ui-icons'

type Props = {
  expense: Expense
  fallbackCurrency: string
  onDelete: (id: string) => void
}

export function ExpenseRow({ expense, fallbackCurrency, onDelete }: Props) {
  const category = categoryFor(expense.category)
  const label = expense.note || category.label
  const income = isIncome(expense)

  function handleDelete() {
    if (window.confirm(`Delete “${label}”?`)) onDelete(expense.id)
  }

  return (
    <div className="expense-row">
      <span
        className="expense-row__marker"
        style={markerStyle()}
        aria-hidden
      >
        <CategoryIcon id={category.id} />
      </span>

      <div className="expense-row__main">
        <div className="expense-row__title">
          {label}
          {expense.source === 'shortcut' && <span className="badge">auto</span>}
        </div>
        {/* The day it happened; the title already says what it was, and the
            marker's glyph already says which category it went to. */}
        <div className="expense-row__sub">{formatLongDate(expense.spentAt)}</div>
      </div>

      <span
        className={`expense-row__amount expense-row__amount--${
          income ? 'income' : 'expense'
        }`}
      >
        {income ? '+' : '−'}
        {formatMoney(expense.amountCents, expense.currency || fallbackCurrency)}
      </span>

      <button
        type="button"
        className="row-delete"
        onClick={handleDelete}
        aria-label={`Delete ${income ? 'income' : 'expense'}: ${label}`}
      >
        <XIcon />
      </button>
    </div>
  )
}
