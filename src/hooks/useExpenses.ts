import { useCallback, useEffect, useState } from 'react'
import { getToken } from '../lib/api'
import {
  deleteExpense,
  listExpenses,
  newId,
  putExpense,
  requestPersistence,
} from '../lib/db'
import { syncWithServer, type SyncResult } from '../lib/sync'
import type { Expense } from '../lib/types'

export type ExpenseDraft = {
  amountCents: number
  category: string
  note: string
  spentAt: string
  currency: string
}

export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setExpenses(await listExpenses())
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await requestPersistence()
      const items = await listExpenses()
      if (!cancelled) {
        setExpenses(items)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const add = useCallback(
    async (draft: ExpenseDraft) => {
      const now = new Date().toISOString()
      const expense: Expense = {
        id: newId(),
        amountCents: draft.amountCents,
        currency: draft.currency,
        category: draft.category,
        note: draft.note.trim(),
        spentAt: draft.spentAt,
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      }
      await putExpense(expense)
      await reload()
      return expense
    },
    [reload],
  )

  const remove = useCallback(
    async (id: string) => {
      await deleteExpense(id)
      await reload()
    },
    [reload],
  )

  const sync = useCallback(async (): Promise<SyncResult> => {
    const token = getToken()
    if (!token) throw new Error('Add your API token in Settings first.')
    const result = await syncWithServer(token)
    await reload()
    return result
  }, [reload])

  return { expenses, loading, add, remove, reload, sync }
}
