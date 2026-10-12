import { useEffect, useRef, useState } from 'react'
import type { ExpenseDraft } from '../hooks/useExpenses'
import { currencySymbol, parseAmountToCents, todayISO } from '../lib/format'
import { CATEGORIES, DEFAULT_CATEGORY, DEFAULT_CURRENCY } from '../lib/types'

type Props = {
  currency?: string
  onClose: () => void
  onSave: (draft: ExpenseDraft) => Promise<void> | void
}

export function AddExpenseSheet({
  currency = DEFAULT_CURRENCY,
  onClose,
  onSave,
}: Props) {
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(DEFAULT_CATEGORY)
  const [note, setNote] = useState('')
  const [spentAt, setSpentAt] = useState(todayISO())
  const [saving, setSaving] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    amountRef.current?.focus()
  }, [])

  const cents = parseAmountToCents(amount)
  const canSave = cents !== null && cents > 0

  async function handleSave() {
    if (cents === null || cents <= 0 || saving) return
    setSaving(true)
    try {
      await onSave({ amountCents: cents, category, note, spentAt, currency })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Add expense"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet__grabber" />

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

        <div className="field" style={{ marginTop: 18 }}>
          <span className="field__label">Category</span>
          <div className="chips">
            {CATEGORIES.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`chip ${option.id === category ? 'chip--active' : ''}`}
                aria-pressed={option.id === category}
                onClick={() => setCategory(option.id)}
              >
                {option.emoji} {option.label}
              </button>
            ))}
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
      </div>
    </div>
  )
}
