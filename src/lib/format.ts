/** Formatting and parsing helpers. Money lives in integer cents everywhere. */

import { DEFAULT_CURRENCY } from './types'

export function formatMoney(
  amountCents: number,
  currency = DEFAULT_CURRENCY,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    ...options,
  }).format(amountCents / 100)
}

export function currencySymbol(currency = DEFAULT_CURRENCY): string {
  const parts = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).formatToParts(0)
  return parts.find((part) => part.type === 'currency')?.value ?? '₹'
}

/** Parse a user-typed amount ("12.50", "1,200") into integer cents. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.,-]/g, '').replace(/,/g, '.')
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

/** Today's local calendar date as `YYYY-MM-DD` (not UTC). */
export function todayISO(): string {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10)
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

export function currentMonthKey(): string {
  return todayISO().slice(0, 7)
}

/** Day of the month, 1-based. Used for the "per day" average. */
export function currentDayOfMonth(): number {
  return new Date().getDate()
}

export function formatDayLabel(iso: string): string {
  const today = todayISO()
  if (iso === today) return 'Today'

  const date = new Date(`${iso}T00:00:00`)
  const now = new Date()
  const shifted = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  const yesterday = new Date(shifted.getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10)
  if (iso === yesterday) return 'Yesterday'

  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function formatMonthLabel(iso: string): string {
  const date = new Date(`${iso}-01T00:00:00`)
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
