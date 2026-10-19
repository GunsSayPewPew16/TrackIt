import { useCallback, useSyncExternalStore } from "react"

import {
  budgetSnapshot,
  setBudgetLimit,
  setBudgetName,
  setBudgetTracked,
  subscribeBudgets,
  type BudgetScope,
} from "@/lib/budget"

/**
 * The owner's two budgets — what each is called, what each allows and what each counts —
 * and the three ways to change them.
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

  /**
   * Renaming is a **commit**, not a keystroke: it is called when the field is left, and it
   * is what the card behind the panel reads. See `setBudgetName` for why the trim waits.
   */
  const saveName = useCallback((scope: BudgetScope, name: string) => {
    setBudgetName(scope, name)
  }, [])

  return { limits: state.limits, tracked: state.tracked, names: state.names, save, saveTracked, saveName }
}
