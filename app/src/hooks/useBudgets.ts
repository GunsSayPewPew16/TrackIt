import { useCallback, useSyncExternalStore } from "react"

import { budgetSnapshot, setBudgetLimit, subscribeBudgets, type BudgetScope } from "@/lib/budget"

/**
 * The owner's two limits, and the one way to change them.
 *
 * The store lives outside React (`lib/budget.ts`) because two screens read it — the
 * dashboard's envelope card and the stats dial — and the number has to survive a reload.
 * `useSyncExternalStore` keeps whichever screen is open in step with it without copying the
 * limits into state, and the store hands back one cached snapshot so reading it twice
 * cannot re-render anything.
 */
export function useBudgets() {
  const limits = useSyncExternalStore(subscribeBudgets, budgetSnapshot, budgetSnapshot)

  const save = useCallback((scope: BudgetScope, cents: number) => {
    setBudgetLimit(scope, cents)
  }, [])

  return { limits, save }
}
