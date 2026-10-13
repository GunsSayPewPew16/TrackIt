import type { Expense, ExpenseSource } from './types'

/**
 * Client for the TrackIt Worker API (`/api/*`).
 *
 * The API is same-origin in production and proxied to the local Worker during
 * development, so all paths here are relative.
 */

const TOKEN_KEY = 'trackit.apiToken'

/** Shape returned by the Worker. Money travels as integer cents. */
type ServerExpense = {
  id: string
  amountCents: number
  currency: string
  kind: string
  category: string
  note: string
  date: string
  source: ExpenseSource
  createdAt: string
  updatedAt: string
}

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private mode / storage disabled — non-fatal */
  }
}

function toExpense(row: ServerExpense): Expense {
  return {
    id: row.id,
    amountCents: row.amountCents,
    currency: row.currency,
    kind: row.kind === 'income' ? 'income' : 'expense',
    category: row.category,
    note: row.note,
    spentAt: row.date,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toServerPayload(expense: Expense) {
  return {
    id: expense.id,
    amountCents: expense.amountCents,
    currency: expense.currency,
    kind: expense.kind,
    category: expense.category,
    note: expense.note,
    date: expense.spentAt,
    source: expense.source,
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
  }
}

async function apiFetch(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`,
    )
  }
  return response
}

export async function pullExpenses(token: string): Promise<Expense[]> {
  const response = await apiFetch('/api/expenses', token)
  const rows = (await response.json()) as ServerExpense[]
  return rows.map(toExpense)
}

export async function pushExpenses(
  expenses: Expense[],
  token: string,
): Promise<Expense[]> {
  if (expenses.length === 0) return []
  const response = await apiFetch('/api/expenses', token, {
    method: 'POST',
    body: JSON.stringify(expenses.map(toServerPayload)),
  })
  const rows = (await response.json()) as ServerExpense[]
  return rows.map(toExpense)
}

export async function deleteRemoteExpense(
  id: string,
  token: string,
): Promise<void> {
  await apiFetch(`/api/expense/${encodeURIComponent(id)}`, token, {
    method: 'DELETE',
  })
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch('/api/health')
    return response.ok
  } catch {
    return false
  }
}
