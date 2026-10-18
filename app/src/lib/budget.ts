/**
 * The one budget the app carries: Food & Beverages, ₹5,000 a month.
 *
 * The dashboard's envelope card and the stats screen's gauge are the same figure seen twice,
 * so both read it from here rather than keeping a limit of their own — a screen that said
 * ₹5,000 while the other said ₹1,500 was the state this file replaced.
 *
 * **It is scoped to a Wallet dimension, not to the whole month.** "Food & Beverages" is a
 * group in `lib/categories.ts` (`food-drinks`): the dimension's own row plus Groceries,
 * Restaurants and Bar & Café. Money filed under any of those four counts; a taxi, a rent
 * payment or an income row does not. The rule is `categoryFor`'s group, so an id the app does
 * not know is never silently counted as food.
 *
 * **The limit is the owner's own number** — five thousand rupees in the month — and it is a
 * constant rather than an imported Wallet budget because the owner asked for this budget by
 * name. A Wallet export's own `Budget` documents still drive the per-row bars on the ledger
 * (`lib/derive.ts`), which is a different question: what one row's category has used up.
 */

import { categoryFor } from "./categories"
import type { Row } from "./types"

/** The Wallet dimension the budget is about: every F&B category is painted this group. */
export const BUDGET_GROUP = "food-drinks"

/** What the budget allows in one month, in integer paise: ₹5,000. */
export const BUDGET_CENTS = 500_000

/** What the dashboard's card is called, and what the gauge measures against. */
export const BUDGET_TITLE = "F&B Budget"

/** Whether money filed under this category is the budget's business. */
export function isBudgetCategory(categoryId: string): boolean {
  return categoryFor(categoryId).group === BUDGET_GROUP
}

/**
 * What the budget has seen in a window, in paise: expenses only, half-open `[from, to)` like
 * every other window in the app, and only rows filed under the dimension.
 */
export function budgetSpent(rows: Row[], from: number, to: number): number {
  let total = 0
  for (const row of rows) {
    if (row.kind !== "expense") continue
    if (row.at < from || row.at >= to) continue
    if (!isBudgetCategory(row.category)) continue
    total += row.amountCents
  }
  return total
}
