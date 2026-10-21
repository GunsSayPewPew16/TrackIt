/**
 * How far back the total-balance chart reaches. Each option is a count of calendar months
 * ending with the current one, so "past 3 months" is this month and the two before it. A range
 * always starts on the 1st, which is also where its opening balance is read from
 * (`lib/analytics.ts`).
 *
 * The choice is kept on this device, so the chart reopens on the range the owner last picked.
 */
export const BALANCE_SPANS = [
  { months: 1, label: "Current month" },
  { months: 3, label: "Past 3 months" },
  { months: 6, label: "Past 6 months" },
] as const

export type BalanceSpan = (typeof BALANCE_SPANS)[number]["months"]

const STORAGE_KEY = "trackit-balance-span"
const DEFAULT_SPAN: BalanceSpan = 1

/** The stored value if it is one of the options, otherwise the current month. */
function spanOf(value: unknown): BalanceSpan {
  return BALANCE_SPANS.find((option) => option.months === value)?.months ?? DEFAULT_SPAN
}

/** The range last picked on this device, or the current month when none is stored. */
export function storedBalanceSpan(): BalanceSpan {
  try {
    return spanOf(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null"))
  } catch {
    return DEFAULT_SPAN
  }
}

export function rememberBalanceSpan(months: BalanceSpan): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(months))
  } catch {
    // Storage can be full or blocked. The chart still switches; it just opens on the default next time.
  }
}
