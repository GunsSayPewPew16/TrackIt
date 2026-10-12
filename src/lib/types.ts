/** Shared domain types for TrackIt. */

export type ExpenseSource = 'manual' | 'shortcut'

export type Expense = {
  id: string
  /** Money is stored as integer minor units (cents) to avoid float drift. */
  amountCents: number
  currency: string
  category: string
  note: string
  /** Local calendar date the money was spent, as `YYYY-MM-DD`. */
  spentAt: string
  source: ExpenseSource
  createdAt: string
  updatedAt: string
}

export type Category = {
  id: string
  label: string
  emoji: string
}

export const CATEGORIES: Category[] = [
  { id: 'food', label: 'Food', emoji: '🍔' },
  { id: 'groceries', label: 'Groceries', emoji: '🛒' },
  { id: 'transport', label: 'Transport', emoji: '🚗' },
  { id: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { id: 'home', label: 'Home', emoji: '🏠' },
  { id: 'bills', label: 'Bills', emoji: '💡' },
  { id: 'health', label: 'Health', emoji: '💊' },
  { id: 'fun', label: 'Fun', emoji: '🎉' },
  { id: 'other', label: 'Other', emoji: '📦' },
]

export const DEFAULT_CATEGORY = 'other'

export function categoryFor(id: string): Category {
  return (
    CATEGORIES.find((category) => category.id === id) ??
    CATEGORIES[CATEGORIES.length - 1]
  )
}

export const DEFAULT_CURRENCY = 'USD'
