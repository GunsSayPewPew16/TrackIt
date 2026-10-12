/**
 * TrackIt API — Cloudflare Worker.
 *
 * Serves the built PWA from static assets and exposes a small, token-guarded
 * JSON API. The primary consumer is an Apple Shortcut on the phone, which can
 * POST a transaction straight into D1 without opening the app.
 *
 *   GET    /api/health            → liveness probe (no auth)
 *   POST   /api/expense           → create one expense   (auth)
 *   POST   /api/expenses          → upsert many expenses (auth, used by sync)
 *   GET    /api/expenses          → list expenses        (auth)
 *   DELETE /api/expense/:id       → delete one expense   (auth)
 */

export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  /** Shared secret for every /api route. Set with `wrangler secret put API_TOKEN`. */
  API_TOKEN?: string
}

type ExpenseRow = {
  id: string
  amount_cents: number
  currency: string
  category: string
  note: string
  spent_at: string
  source: string
  created_at: string
  updated_at: string
}

type NormalizedExpense = {
  id: string
  amountCents: number
  currency: string
  category: string
  note: string
  date: string
  source: string
  createdAt: string
  updatedAt: string
}

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
}

const UPSERT_SQL = `
  INSERT INTO expenses
    (id, amount_cents, currency, category, note, spent_at, source, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    amount_cents = excluded.amount_cents,
    currency = excluded.currency,
    category = excluded.category,
    note = excluded.note,
    spent_at = excluded.spent_at,
    updated_at = excluded.updated_at
`

/* ---------------------------------------------------------------- helpers */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...CORS_HEADERS,
    },
  })
}

function error(message: string, status: number): Response {
  return json({ error: message }, status)
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i]
  return diff === 0
}

function isAuthorized(request: Request, env: Env): boolean {
  const expected = env.API_TOKEN
  if (!expected) return false
  const header = request.headers.get('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : ''
  return token.length > 0 && timingSafeEqual(token, expected)
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Accepts major units ("12.50", 12.5) and returns integer cents. */
function toCents(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 100)
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''))
    if (Number.isFinite(parsed)) return Math.round(parsed * 100)
  }
  return null
}

function toApi(row: ExpenseRow) {
  return {
    id: row.id,
    amountCents: row.amount_cents,
    currency: row.currency,
    category: row.category,
    note: row.note,
    date: row.spent_at,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Turns arbitrary input (a Shortcut payload or a sync payload) into a row.
 * Very permissive on purpose: Shortcuts users rarely send a perfect schema.
 */
function normalizeExpense(
  input: Record<string, unknown>,
  defaultSource: string,
): NormalizedExpense | { error: string } {
  const amountCents =
    typeof input.amountCents === 'number'
      ? Math.round(input.amountCents)
      : toCents(input.amount)

  if (amountCents === null || !Number.isFinite(amountCents)) {
    return { error: 'Provide "amount" (e.g. 12.50) or "amountCents".' }
  }

  const now = new Date().toISOString()
  const noteValue = [input.note, input.description, input.memo, input.title].find(
    (value) => typeof value === 'string' && value.trim().length > 0,
  )
  const dateValue = typeof input.date === 'string' && input.date ? input.date : todayISO()

  return {
    id:
      typeof input.id === 'string' && input.id.length > 0
        ? input.id
        : crypto.randomUUID(),
    amountCents,
    currency:
      typeof input.currency === 'string' && input.currency
        ? input.currency
        : 'INR',
    category:
      typeof input.category === 'string' && input.category.trim()
        ? input.category.trim().toLowerCase()
        : 'unknown',
    note: typeof noteValue === 'string' ? noteValue : '',
    date: dateValue.slice(0, 10),
    source:
      typeof input.source === 'string' && input.source ? input.source : defaultSource,
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : now,
  }
}

function bindExpense(env: Env, expense: NormalizedExpense): D1PreparedStatement {
  return env.DB.prepare(UPSERT_SQL).bind(
    expense.id,
    expense.amountCents,
    expense.currency,
    expense.category,
    expense.note,
    expense.date,
    expense.source,
    expense.createdAt,
    expense.updatedAt,
  )
}

// Create the schema on first use so a fresh deploy works without a manual step.
let schemaReady: Promise<unknown> | undefined
function ensureSchema(env: Env): Promise<unknown> {
  schemaReady ??= env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        category TEXT NOT NULL DEFAULT 'unknown',
        note TEXT NOT NULL DEFAULT '',
        spent_at TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_expenses_spent_at ON expenses (spent_at DESC)',
    ),
  ])
  return schemaReady
}

/* ----------------------------------------------------------------- routes */

async function createExpense(request: Request, env: Env): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return error('Request body must be valid JSON.', 400)
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return error('Request body must be a JSON object.', 400)
  }

  const normalized = normalizeExpense(body as Record<string, unknown>, 'shortcut')
  if ('error' in normalized) return error(normalized.error, 400)

  await bindExpense(env, normalized).run()
  const row = await env.DB.prepare('SELECT * FROM expenses WHERE id = ?')
    .bind(normalized.id)
    .first<ExpenseRow>()

  return json(row ? toApi(row) : normalized, 201)
}

async function upsertExpenses(request: Request, env: Env): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return error('Request body must be valid JSON.', 400)
  }

  const list = Array.isArray(body) ? body : [body]
  if (list.length === 0) return json([])

  const normalized: NormalizedExpense[] = []
  for (const item of list) {
    if (typeof item !== 'object' || item === null) {
      return error('Every item must be a JSON object.', 400)
    }
    const result = normalizeExpense(item as Record<string, unknown>, 'manual')
    if ('error' in result) return error(result.error, 400)
    normalized.push(result)
  }

  await env.DB.batch(normalized.map((item) => bindExpense(env, item)))

  const placeholders = normalized.map(() => '?').join(', ')
  const rows = await env.DB.prepare(
    `SELECT * FROM expenses WHERE id IN (${placeholders})`,
  )
    .bind(...normalized.map((item) => item.id))
    .all<ExpenseRow>()

  return json(rows.results.map(toApi), 201)
}

async function listExpenses(url: URL, env: Env): Promise<Response> {
  const requested = Number(url.searchParams.get('limit') ?? '500')
  const limit = Math.min(Number.isFinite(requested) && requested > 0 ? requested : 500, 1000)
  const since = url.searchParams.get('since')

  const rows = since
    ? await env.DB.prepare(
        'SELECT * FROM expenses WHERE updated_at > ? ORDER BY spent_at DESC, created_at DESC LIMIT ?',
      )
        .bind(since, limit)
        .all<ExpenseRow>()
    : await env.DB.prepare(
        'SELECT * FROM expenses ORDER BY spent_at DESC, created_at DESC LIMIT ?',
      )
        .bind(limit)
        .all<ExpenseRow>()

  return json(rows.results.map(toApi))
}

async function deleteExpense(id: string, env: Env): Promise<Response> {
  await env.DB.prepare('DELETE FROM expenses WHERE id = ?').bind(id).run()
  return json({ ok: true })
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const { pathname } = url

  if (pathname === '/api/health') {
    return json({ ok: true, service: 'trackit' })
  }

  if (!isAuthorized(request, env)) {
    return error('Unauthorized. Send "Authorization: Bearer <API_TOKEN>".', 401)
  }

  await ensureSchema(env)

  if (pathname === '/api/expense' && request.method === 'POST') {
    return createExpense(request, env)
  }
  if (pathname === '/api/expenses' && request.method === 'POST') {
    return upsertExpenses(request, env)
  }
  if (pathname === '/api/expenses' && request.method === 'GET') {
    return listExpenses(url, env)
  }
  if (pathname.startsWith('/api/expense/') && request.method === 'DELETE') {
    return deleteExpense(decodeURIComponent(pathname.slice('/api/expense/'.length)), env)
  }

  return error('Not found.', 404)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS })
      }
      return handleApi(request, env, url)
    }

    return env.ASSETS.fetch(request)
  },
}
