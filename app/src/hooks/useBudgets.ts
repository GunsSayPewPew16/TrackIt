import { useCallback, useSyncExternalStore } from "react"

import {
  budgetSnapshot,
  setBudgetLimit,
  setBudgetTracked,
  subscribeBudgets,
  type BudgetScope,
} from "@/lib/budget"

/**
 * The owner's two budgets — what each allows and what each counts — and the two ways to
 * change them.
 *
 * The store lives outside React (`lib/budget.ts`) because two screens read it — the
 * dashboard's envelope card and the stats dial — and both numbers have to survive a reload.
 * `useSyncExternalStore` keeps whichever screen is open in step with it without copying the
 * state into React, and the store hands back one cached snapshot so reading it twice cannot
 * re-render anything. A toggle in the editor therefore reaches the card behind it on the
 * frame it happens, which is what makes the panel explain itself.
 */
export function useBudgets() {
  const state = useSyncExternalStore(subscribeBudgets, budgetSnapshot, budgetSnapshot)

  const save = useCallback((scope: BudgetScope, cents: number) => {
    setBudgetLimit(scope, cents)
  }, [])

  const saveTracked = useCallback((scope: BudgetScope, categories: string[] | null) => {
    setBudgetTracked(scope, categories)
  }, [])

  return { limits: state.limits, tracked: state.tracked, save, saveTracked }
}
