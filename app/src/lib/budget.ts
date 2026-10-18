/**
 * The app's two budgets: Food & Beverages, ₹1,500 a month, and all spending, ₹5,000 a month.
 *
 * They are **two different questions**, and the app draws one of each:
 *
 * - **`food`** is the dashboard's envelope card. It counts only the Wallet dimension
 *   `food-drinks` (`lib/categories.ts`): the dimension's own row plus Groceries, Restaurants
 *   and Bar & Café. A taxi, a rent payment or an income row never moves it.
 * - **`total`** is the stats screen's dial. It counts every expense in the month, whatever
 *   its category, because that is what "what has the month cost me?" means.
 *
 * Both limits are **the owner's own numbers**, and both are editable from the card that
 * draws them (a long press opens the editor, `features/budget/BudgetSheet.tsx`). The store
 * lives here — `localStorage`, one key, a cached snapshot so `useSyncExternalStore` can
 * compare by identity, exactly like `lib/ledger.ts` — and the models take the limit as an
 * argument rather than reading the store, so `derive.ts` and `analytics.ts` stay pure and a
 * screen re-derives only when the number it was drawn with actually changes.
 *
 * A Wallet export's own `Budget` documents are **not** these: they still drive the per-row
 * bars on the ledger (`lib/derive.ts`), which is a different question — what one row's
 * category has used up.
 */

import { categoryFor } from "./categories"
import type { Row } from "./types"

/** Which of the two budgets a figure or an edit is about. */
export type BudgetScope = "food" | "total"

export const BUDGET_SCOPES: readonly BudgetScope[] = ["food", "total"]

/** The Wallet dimension the food budget is about: every F&B category is painted this group. */
export const BUDGET_GROUP = "food-drinks"

/** What each budget allows in one month, in integer paise, before the owner changes it. */
export const BUDGET_DEFAULTS: Record<BudgetScope, number> = {
  food: 150_000, // ₹1,500
  total: 500_000, // ₹5,000
}

/** Every limit the app holds, in integer paise. */
export type BudgetLimits = Record<BudgetScope, number>

/**
 * What the two cards call their budgets, and what the editor says above the keypad.
 *
 * `label` is the short name the card itself prints; `title` is the editor's heading;
 * `blurb` is the one line explaining what counts, because two budgets with different
 * scopes can otherwise only be told apart by their figure.
 */
export const BUDGET_COPY: Record<
  BudgetScope,
  { label: string; title: string; blurb: string }
> = {
  food: {
    label: "F&B Budget",
    title: "Food & Beverages budget",
    blurb: "Groceries, restaurants, bars and cafés — nothing else counts against it.",
  },
  total: {
    label: "Total Budget",
    title: "Total spending budget",
    blurb: "Every expense this month, whatever its category.",
  },
}

/** Whether money filed under this category is the food budget's business. */
export function isBudgetCategory(categoryId: string): boolean {
  return categoryFor(categoryId).group === BUDGET_GROUP
}

/**
 * What a budget has seen in a window, in paise: expenses only, half-open `[from, to)` like
 * every other window in the app. `food` counts just the dimension; `total` counts every
 * expense in the window.
 */
export function budgetSpent(rows: Row[], from: number, to: number, scope: BudgetScope = "food"): number {
  let total = 0
  for (const row of rows) {
    if (row.kind !== "expense") continue
    if (row.at < from || row.at >= to) continue
    if (scope === "food" && !isBudgetCategory(row.category)) continue
    total += row.amountCents
  }
  return total
}

/* ------------------------------------------------------------------ *
 * The store
 *
 * One small object, one key, and the same shape as the ledger's store: a cached snapshot
 * (so `useSyncExternalStore` sees the same object until something is written), listeners,
 * and best-effort storage. A browser that refuses storage costs the owner a remembered
 * limit, never the card they are looking at.
 * ------------------------------------------------------------------ */

const STORAGE_KEY = "trackit-budgets"

/** The snapshot a store-less browser has. A shared constant, because identity is compared. */
const FALLBACK: BudgetLimits = { ...BUDGET_DEFAULTS }

let cache: BudgetLimits | null = null

const listeners = new Set<() => void>()

/** A stored limit is kept only if it is a positive whole number of paise. */
function limitFrom(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback
}

function read(): BudgetLimits {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return FALLBACK
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return FALLBACK
    const store = parsed as Record<string, unknown>
    return {
      food: limitFrom(store.food, BUDGET_DEFAULTS.food),
      total: limitFrom(store.total, BUDGET_DEFAULTS.total),
    }
  } catch {
    return FALLBACK
  }
}

/** Both limits, handed back by reference until something changes. */
export function budgetSnapshot(): BudgetLimits {
  if (cache === null) cache = read()
  return cache
}

/** Set one limit, in paise, and tell every card that draws it. */
export function setBudgetLimit(scope: BudgetScope, cents: number): void {
  const next: BudgetLimits = { ...budgetSnapshot(), [scope]: limitFrom(cents, BUDGET_DEFAULTS[scope]) }
  cache = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // The new limit still holds for this session; only remembering it was refused.
  }
  for (const listener of listeners) listener()
}

/** Watch the store. The returned function stops watching. */
export function subscribeBudgets(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
