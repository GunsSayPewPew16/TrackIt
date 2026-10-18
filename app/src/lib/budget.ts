/**
 * The app's two budgets: Food & Beverages, ₹1,500 a month, and all spending, ₹5,000 a month.
 *
 * They are **two different questions**, and the app draws one of each:
 *
 * - **`food`** is the dashboard's envelope card. It counts what the owner says it counts —
 *   by default the Wallet dimension `food-drinks`: the dimension's own row plus Groceries,
 *   Restaurants and Bar & Café. A taxi, a rent payment or an income row never moves it.
 * - **`total`** is the stats screen's dial. By default it counts every expense in the month,
 *   whatever its category, because that is what "what has the month cost me?" means.
 *
 * **Which categories count is the owner's choice** (`tracked`), and it is made from the card
 * that draws the figure: a long press opens the editor, which offers both the limit and the
 * categories/subcategories the budget is about. A budget that tracks nothing is a real
 * answer — the card then reads ₹0 of its limit rather than pretending to a default — and so
 * is `total` left at `null`, which means **every expense** rather than a list of them.
 *
 * Both limits are **the owner's own numbers**. The store lives here — `localStorage`, one
 * key, a cached snapshot so `useSyncExternalStore` can compare by identity, exactly like
 * `lib/ledger.ts` — and the models take the limit and the tracked set as arguments rather
 * than reading the store, so `derive.ts` and `analytics.ts` stay pure and a screen re-derives
 * only when something it was drawn with actually changes.
 *
 * A Wallet export's own `Budget` documents are **not** these: they still drive the per-row
 * bars on the ledger (`lib/derive.ts`), which is a different question — what one row's
 * category has used up.
 */

import { CATEGORY_GROUPS, categoryFor } from "./categories"
import type { Row } from "./types"

/** Which of the two budgets a figure or an edit is about. */
export type BudgetScope = "food" | "total"

export const BUDGET_SCOPES: readonly BudgetScope[] = ["food", "total"]

/** The Wallet dimension the food budget is about by default: every F&B category is painted this group. */
export const BUDGET_GROUP = "food-drinks"

/** What each budget allows in one month, in integer paise, before the owner changes it. */
export const BUDGET_DEFAULTS: Record<BudgetScope, number> = {
  food: 150_000, // ₹1,500
  total: 500_000, // ₹5,000
}

/** Every limit the app holds, in integer paise. */
export type BudgetLimits = Record<BudgetScope, number>

/**
 * What each budget counts: category ids, or `null` for **every expense**.
 *
 * `null` is only ever the total budget's default. An empty array is a different statement —
 * "this budget tracks nothing" — and the two must not collapse into one another, which is
 * why this is `string[] | null` rather than a list that might happen to be empty.
 */
export type BudgetTracked = Record<BudgetScope, string[] | null>

/** The Food & Beverages group's own id plus its three subcategories. */
const FOOD_CATEGORIES: string[] =
  CATEGORY_GROUPS.find((group) => group.id === BUDGET_GROUP)?.categories ?? [BUDGET_GROUP]

export const BUDGET_TRACKED_DEFAULTS: BudgetTracked = {
  food: [...FOOD_CATEGORIES],
  total: null,
}

/** Everything the store holds, in one object so a snapshot can be compared by identity. */
export type BudgetState = {
  limits: BudgetLimits
  tracked: BudgetTracked
}

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

/** Whether money filed under this category is the food budget's business by default. */
export function isBudgetCategory(categoryId: string): boolean {
  return categoryFor(categoryId).group === BUDGET_GROUP
}

/**
 * What a budget has seen in a window, in paise: expenses only, half-open `[from, to)` like
 * every other window in the app.
 *
 * `categories === null` counts every expense; an array counts only the rows filed under one
 * of its ids, and an empty array counts nothing at all.
 */
export function budgetSpent(
  rows: Row[],
  from: number,
  to: number,
  categories: string[] | null,
): number {
  let total = 0
  for (const row of rows) {
    if (row.kind !== "expense") continue
    if (row.at < from || row.at >= to) continue
    if (categories !== null && !categories.includes(row.category)) continue
    total += row.amountCents
  }
  return total
}

/** What a tracked id is called on a chip: the leaf's own name. */
export function trackedName(categoryId: string): string {
  return categoryFor(categoryId).label
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
const FALLBACK: BudgetState = {
  limits: { ...BUDGET_DEFAULTS },
  tracked: { food: [...FOOD_CATEGORIES], total: null },
}

let cache: BudgetState | null = null

const listeners = new Set<() => void>()

/** A stored limit is kept only if it is a positive whole number of paise. */
function limitFrom(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback
}

/** A stored tracked set: ids only, deduplicated; `undefined` falls back to the default. */
function trackedFrom(value: unknown, fallback: string[] | null): string[] | null {
  if (value === null) return null
  if (!Array.isArray(value)) return fallback
  const ids = value.filter((id): id is string => typeof id === "string")
  return [...new Set(ids)]
}

function read(): BudgetState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return FALLBACK
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return FALLBACK
    const store = parsed as Record<string, unknown>
    /*
     * A ledger written before this shape existed holds the two limits at the top level and
     * knows nothing about categories (`{ food: 150000, total: 500000 }`). Reading both
     * spellings is the whole migration: the first save writes the new shape, and a budget
     * whose categories were never chosen is exactly the default set.
     */
    const limits = store.limits as Record<string, unknown> | undefined
    const tracked = store.tracked as Record<string, unknown> | undefined
    return {
      limits: {
        food: limitFrom(limits?.food ?? store.food, BUDGET_DEFAULTS.food),
        total: limitFrom(limits?.total ?? store.total, BUDGET_DEFAULTS.total),
      },
      tracked: {
        food: trackedFrom(tracked?.food, BUDGET_TRACKED_DEFAULTS.food),
        total: trackedFrom(tracked?.total, BUDGET_TRACKED_DEFAULTS.total),
      },
    }
  } catch {
    return FALLBACK
  }
}

/** Both limits and both tracked sets, handed back by reference until something changes. */
export function budgetSnapshot(): BudgetState {
  if (cache === null) cache = read()
  return cache
}

/** Write the store and tell every card that draws it. */
function commit(next: BudgetState): void {
  cache = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // The new value still holds for this session; only remembering it was refused.
  }
  for (const listener of listeners) listener()
}

/** Set one limit, in paise, and tell every card that draws it. */
export function setBudgetLimit(scope: BudgetScope, cents: number): void {
  const current = budgetSnapshot()
  commit({
    limits: { ...current.limits, [scope]: limitFrom(cents, BUDGET_DEFAULTS[scope]) },
    tracked: current.tracked,
  })
}

/**
 * Set what a budget counts, and tell every card that draws it.
 *
 * It is called on **every toggle** rather than on a save button, because the card behind the
 * panel is the answer to "what does this do?" — the gauge moves while the panel is open,
 * which is a far better explanation than a caption under a list.
 */
export function setBudgetTracked(scope: BudgetScope, categories: string[] | null): void {
  const current = budgetSnapshot()
  commit({
    limits: current.limits,
    tracked: {
      ...current.tracked,
      [scope]: categories === null ? null : [...new Set(categories)],
    },
  })
}

/** Watch the store. The returned function stops watching. */
export function subscribeBudgets(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
