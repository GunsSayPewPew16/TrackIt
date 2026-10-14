import { useEffect, useRef, useState } from 'react'
import type { ExpenseDraft } from '../hooks/useExpenses'
import { currencySymbol, parseAmountToCents, todayISO } from '../lib/format'
import { CategoryIcon } from '../lib/icons'
import { markerStyle } from '../lib/markers'
import { BackIcon, CheckIcon, ChevronRightIcon } from '../lib/ui-icons'
import {
  categoryFor,
  CATEGORY_GROUPS,
  DEFAULT_CATEGORY,
  DEFAULT_CURRENCY,
  type ExpenseKind,
} from '../lib/types'

/**
 * Logging an expense — a page of its own rather than a panel over the dashboard.
 *
 * It used to slide up from the bottom of Home, which made the rail's bolt a
 * decoration instead of a destination: the form arrived over whatever was behind
 * it, and the dashboard underneath kept its own scroll. Off the rail it is a
 * screen like Statistics or Cards, with the back arrow every other page uses as
 * its way out, and the same form inside it.
 *
 * The category browser is Wallet's own: the groups first, then one group's
 * categories, with the group's own entry on top because whole outings are logged
 * against the group itself.
 */

const KINDS: { id: ExpenseKind; label: string }[] = [
  { id: 'expense', label: 'Expense' },
  { id: 'income', label: 'Income' },
]

type Props = {
  currency?: string
  onClose: () => void
  onSave: (draft: ExpenseDraft) => Promise<void> | void
}

export function AddExpensePage({ currency = DEFAULT_CURRENCY, onClose, onSave }: Props) {
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState<ExpenseKind>('expense')
  const [category, setCategory] = useState(DEFAULT_CATEGORY)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [spentAt, setSpentAt] = useState(todayISO())
  const [saving, setSaving] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    amountRef.current?.focus()
  }, [])

  // Escape is the other way out, the same key Financial Operations answers to.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const cents = parseAmountToCents(amount)
  const canSave = cents !== null && cents > 0
  const group = CATEGORY_GROUPS.find((candidate) => candidate.id === openGroup)

  async function handleSave() {
    if (cents === null || cents <= 0 || saving) return
    setSaving(true)
    try {
      await onSave({ amountCents: cents, kind, category, note, spentAt, currency })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page-overlay is-open" aria-label="Add expense">
      <div className="ops-header">
        <button
          type="button"
          className="icon-btn icon-btn--round"
          title="Back"
          aria-label="Close the add form"
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
      </div>

      <h1 className="screen-title">Add expense</h1>

      <div className="amount-wrap">
        <span className="amount-wrap__symbol" aria-hidden>
          {currencySymbol(currency)}
        </span>
        <input
          ref={amountRef}
          className="amount-input"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void handleSave()
          }}
          aria-label="Amount"
        />
      </div>

      <div className="kinds" role="group" aria-label="Kind">
        {KINDS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`kind ${option.id === kind ? 'kind--active' : ''}`}
            aria-pressed={option.id === kind}
            onClick={() => setKind(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="field" style={{ marginTop: 18 }}>
        <div className="field__head">
          <span className="field__label">Category</span>
          <span className="field__value">{categoryFor(category).label}</span>
        </div>

        {/* Wallet's own browser: the groups, then one group's categories.
            A group's first row is the group itself — whole outings are logged
            against it — which is why it sits above its subcategories. */}
        <div className="picker">
          <div className="picker__head">
            {group && (
              <button
                type="button"
                className="picker__back"
                onClick={() => setOpenGroup(null)}
                aria-label="All categories"
              >
                <BackIcon />
              </button>
            )}
            <span className="picker__title">{group ? group.label : 'All categories'}</span>
          </div>

          <div className="picker__list">
            {group
              ? group.categories.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`cat-row${id === category ? ' cat-row--picked' : ''}`}
                    aria-pressed={id === category}
                    onClick={() => setCategory(id)}
                  >
                    <span className="cat-row__marker" style={markerStyle()} aria-hidden>
                      <CategoryIcon id={id} />
                    </span>
                    <span className="cat-row__name">{categoryFor(id).label}</span>
                    {id === category && <CheckIcon className="cat-row__check" />}
                  </button>
                ))
              : CATEGORY_GROUPS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="cat-row"
                    aria-expanded={false}
                    onClick={() => setOpenGroup(option.id)}
                  >
                    <span className="cat-row__marker" style={markerStyle()} aria-hidden>
                      <CategoryIcon id={option.id} />
                    </span>
                    <span className="cat-row__name">{option.label}</span>
                    <ChevronRightIcon className="cat-row__chev" />
                  </button>
                ))}
          </div>
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="expense-note">
          Note
        </label>
        <input
          id="expense-note"
          className="input"
          placeholder="What was it for?"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="expense-date">
          Date
        </label>
        <input
          id="expense-date"
          className="input"
          type="date"
          value={spentAt}
          onChange={(event) => setSpentAt(event.target.value || todayISO())}
        />
      </div>

      <div className="btn-row">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!canSave || saving}
          onClick={() => void handleSave()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  )
}
