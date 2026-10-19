import { useCallback, useSyncExternalStore } from "react"

import {
  addEnvelope,
  budgetSnapshot,
  moveEnvelope,
  removeEnvelope,
  setActiveEnvelope,
  setEnvelopeLimit,
  setEnvelopeName,
  setEnvelopeTracked,
  setTotalLimit,
  setTotalName,
  setTotalTracked,
  subscribeBudgets,
  type BudgetTracked,
} from "@/lib/budget"

/**
 * The owner's budgets — the dashboard's envelopes and the stats dial's total — and the ways
 * to change them.
 *
 * The store lives outside React (`lib/budget.ts`) because two screens read it — the
 * dashboard's carousel and the stats dial — and every number has to survive a reload.
 * `useSyncExternalStore` keeps whichever screen is open in step with it without copying the
 * state into React, and the store hands back one cached snapshot so reading it twice cannot
 * re-render anything. A toggle in the editor therefore reaches the card behind it on the
 * frame it happens, which is what makes the panel explain itself.
 */
export function useBudgets() {
  const state = useSyncExternalStore(subscribeBudgets, budgetSnapshot, budgetSnapshot)

  const saveEnvelopeLimit = useCallback((id: string, cents: number) => {
    setEnvelopeLimit(id, cents)
  }, [])

  const saveEnvelopeTracked = useCallback((id: string, categories: BudgetTracked) => {
    setEnvelopeTracked(id, categories)
  }, [])

  /**
   * Renaming is a **commit**, not a keystroke: it is called when the field is left, and it
   * is what the card behind the panel reads. See `setEnvelopeName` for why the trim waits.
   */
  const saveEnvelopeName = useCallback((id: string, name: string) => {
    setEnvelopeName(id, name)
  }, [])

  const createEnvelope = useCallback(() => addEnvelope(), [])

  /** Which card the carousel is on, so it can reopen there and the screen can follow it. */
  const viewEnvelope = useCallback((id: string) => {
    setActiveEnvelope(id)
  }, [])

  const moveBudget = useCallback((id: string, direction: -1 | 1) => {
    moveEnvelope(id, direction)
  }, [])

  const deleteBudget = useCallback((id: string) => removeEnvelope(id), [])

  const saveTotalLimit = useCallback((cents: number) => {
    setTotalLimit(cents)
  }, [])

  const saveTotalTracked = useCallback((categories: BudgetTracked) => {
    setTotalTracked(categories)
  }, [])

  const saveTotalName = useCallback((name: string) => {
    setTotalName(name)
  }, [])

  return {
    envelopes: state.envelopes,
    total: state.total,
    activeEnvelopeId: state.activeId,
    saveEnvelopeLimit,
    saveEnvelopeTracked,
    saveEnvelopeName,
    createEnvelope,
    viewEnvelope,
    moveBudget,
    deleteBudget,
    saveTotalLimit,
    saveTotalTracked,
    saveTotalName,
  }
}
