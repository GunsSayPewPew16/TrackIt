import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Expense } from './types'

/**
 * Local-first storage. IndexedDB is the app's source of truth; the network is
 * an optional sync target (see `lib/sync.ts`).
 */

interface TrackItDB extends DBSchema {
  expenses: {
    key: string
    value: Expense
    indexes: { 'by-spentAt': string }
  }
}

const DB_NAME = 'trackit'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<TrackItDB>> | undefined

function getDB(): Promise<IDBPDatabase<TrackItDB>> {
  dbPromise ??= openDB<TrackItDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore('expenses', { keyPath: 'id' })
      store.createIndex('by-spentAt', 'spentAt')
    },
  })
  return dbPromise
}

export function newId(): string {
  return crypto.randomUUID()
}

/** All expenses, newest spent date first. */
export async function listExpenses(): Promise<Expense[]> {
  const db = await getDB()
  const all = await db.getAll('expenses')
  // Rows written before income existed carry no kind, and they are all
  // spending — normalising here means no caller has to wonder.
  return all
    .map((row) => ({ ...row, kind: row.kind ?? 'expense' }))
    .sort((a, b) =>
      a.spentAt === b.spentAt
        ? b.createdAt.localeCompare(a.createdAt)
        : b.spentAt.localeCompare(a.spentAt),
    )
}

export async function putExpense(expense: Expense): Promise<void> {
  const db = await getDB()
  await db.put('expenses', expense)
}

export async function putMany(expenses: Expense[]): Promise<void> {
  if (expenses.length === 0) return
  const db = await getDB()
  const tx = db.transaction('expenses', 'readwrite')
  await Promise.all([
    ...expenses.map((expense) => tx.store.put(expense)),
    tx.done,
  ])
}

export async function deleteExpense(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('expenses', id)
}

export async function clearExpenses(): Promise<void> {
  const db = await getDB()
  await db.clear('expenses')
}

/**
 * Ask the browser to keep our data. On iOS this matters: unpersisted
 * IndexedDB can be evicted. Returns whether storage is persisted.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function isPersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false
  } catch {
    return false
  }
}

export async function storageEstimate(): Promise<string | null> {
  try {
    const estimate = await navigator.storage?.estimate?.()
    if (!estimate?.usage) return null
    const kb = Math.round(estimate.usage / 1024)
    return kb < 1024 ? `${kb} KB used` : `${(kb / 1024).toFixed(1)} MB used`
  } catch {
    return null
  }
}
