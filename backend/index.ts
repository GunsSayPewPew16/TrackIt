/**
 * TrackIt API — Cloudflare Worker.
 *
 * Serves the built app from static assets and exposes a small, token-guarded
 * JSON API. The primary consumer is an Apple Shortcut on the phone, which can
 * POST a transaction straight into D1 without opening the app.
 *
 *   GET    /api/health            → liveness probe (no auth)
 *   POST   /api/greeting          → one word for the hour (no auth, see below)
 *   POST   /api/expense           → create one expense   (auth)
 *   POST   /api/expenses          → upsert many expenses (auth, used by sync)
 *   GET    /api/expenses          → list expenses        (auth)
 *   DELETE /api/expense/:id       → delete one expense   (auth)
 *
 * **`/api/greeting` is the odd one out, and the only route the app itself calls.** The
 * dashboard's masthead says hello in a different language every open, out of the
 * `hourly_greetings` table below rather than out of any model — the languages are data, the
 * table is the data, and this route reads one row at random out of the part of the day the
 * caller names. It carries no token because there is nothing here to protect: no key, no
 * money, no name — eighty greetings and which one to draw. It is also the one route whose
 * answer the app can afford to lose, since the same eighty words ship inside the app
 * (`app/src/lib/greetings.ts`) and are already on screen before this is asked.
 */

import { GREETINGS, cleanAvoid, cleanSlot, type DaySlot, type Greeting } from '../app/src/lib/greetings'

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
  kind: string
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
  kind: string
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
    (id, amount_cents, currency, kind, category, note, spent_at, source, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    amount_cents = excluded.amount_cents,
    currency = excluded.currency,
    kind = excluded.kind,
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
    kind: row.kind,
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
    // Anything that is not explicitly income is spending, which is also what a
    // Shortcut that omits the field means.
    kind: input.kind === 'income' ? 'income' : 'expense',
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
    expense.kind,
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
  schemaReady ??= (async () => {
    await env.DB.batch([
      env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS expenses (
          id TEXT PRIMARY KEY,
          amount_cents INTEGER NOT NULL,
          currency TEXT NOT NULL DEFAULT 'INR',
          kind TEXT NOT NULL DEFAULT 'expense',
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

    // Income arrived after the first deploys, so a database created before it
    // needs the column added. SQLite has no "ADD COLUMN IF NOT EXISTS", and a
    // fresh table already has it — a failure here just means it is already
    // there, so it must not fail the cached promise.
    await env.DB.prepare(
      "ALTER TABLE expenses ADD COLUMN kind TEXT NOT NULL DEFAULT 'expense'",
    )
      .run()
      .catch(() => undefined)
  })()
  return schemaReady
}

/* -------------------------------------------------------------- greetings */

/**
 * The greetings table: created on first use, and filled whenever a draw finds it empty.
 *
 * It exists so that the words are **data rather than a build artifact**. Adding a language,
 * or correcting a romanization, is one `wrangler d1 execute` against the live database —
 * no rebuild, no redeploy, and the next app open may draw it. That is the whole reason this
 * is a table and not an array: the array is already in the app, and the app is what serves
 * it when this route is not there.
 *
 * **A word now belongs to a part of the day, so a row is keyed by the language *and* the
 * hour.** The pool is eighty rows — twenty languages with a word for each of the four parts
 * — and a caller names the hour it is in (`when` in the request body), which is what keeps a
 * draw from answering 8am with `Buenas noches`. `language` alone cannot be the key any more:
 * `Buenos días` and `Buenas noches` are both Spanish and both have to be stored.
 *
 * **`hourly_greetings` is a new table, and the old `greetings` one is left where it is.**
 * That one held fifty hellos keyed by language, and there is no hour in a row of it to
 * filter on, so it is stale rather than broken: nothing reads it, and a deployment that
 * wants the space back can drop it (`wrangler d1 execute trackit-db --remote --config
 * backend/wrangler.toml --command 'DROP TABLE greetings'`). Dropping it from here would undo
 * the one thing the table is for — a word somebody corrected by hand in the live database.
 *
 * The seed is the app's own list, imported above rather than copied here, so the eighty in
 * the database and the eighty in the bundle cannot drift apart. **Seeding is decided by the
 * draw, not by a flag**: `randomGreeting` fills the table only when a request finds nothing
 * in it, so a fresh deployment fills it on its first greeting, a table somebody emptied
 * fills again on the next one, and a word edited in D1 by hand is never overwritten by a
 * request that found the table full. To put the deployed list back over an edited table,
 * empty it and ask once:
 *
 *   wrangler d1 execute trackit-db --remote --config backend/wrangler.toml \
 *     --command 'DELETE FROM hourly_greetings'
 */
let greetingsReady: Promise<unknown> | undefined

/** The table, created once per isolate — the DDL half of `seedGreetings` below. */
function ensureGreetings(env: Env): Promise<unknown> {
  greetingsReady ??= env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS hourly_greetings (
      language TEXT NOT NULL,
      slot TEXT NOT NULL,
      word TEXT NOT NULL,
      lang TEXT NOT NULL,
      PRIMARY KEY (language, slot)
    )
  `)
    .run()
    .catch((failure: unknown) => {
      // A cold start that failed must not poison the instance for as long as it lives:
      // forget the promise, so the next reader tries the table again.
      greetingsReady = undefined
      throw failure
    })
  return greetingsReady
}

/**
 * The eighty, written over an empty table. `OR REPLACE` on the `(language, slot)` key, so
 * running it twice cannot duplicate a word and cannot half-fill the table.
 */
function seedGreetings(env: Env): Promise<unknown> {
  return env.DB.batch(
    GREETINGS.map((greeting) =>
      env.DB.prepare('INSERT OR REPLACE INTO hourly_greetings (language, slot, word, lang) VALUES (?, ?, ?, ?)')
        .bind(greeting.language, greeting.when ?? '', greeting.word, greeting.lang),
    ),
  )
}

/**
 * One row of the caller's own hour, at random — and never a language it has just seen.
 *
 * Two filters, and they mean different things. `slot = ?` is the hour, and it is **never
 * dropped**: a word for the morning is the only kind of answer this route can give a
 * morning, and a caller that names no hour at all (an older build, or `curl`) is drawn for
 * from the whole table rather than refused. The `avoid` list is what keeps "a different
 * language every open" true even though the choice is a roll of the dice rather than a walk
 * through a shuffled list: the app sends the languages it has shown lately and the query
 * excludes them. If that leaves nothing to draw — a caller that has seen all twenty of this
 * hour's languages — the avoid filter is dropped rather than the greeting refused, because a
 * repeat is a smaller failure than no word at all.
 */
async function pickGreeting(env: Env, avoid: string[], slot: DaySlot | null): Promise<Greeting | null> {
  const draw = async (exclude: string[]): Promise<Greeting | null> => {
    const filters: string[] = []
    const bindings: string[] = []
    if (slot !== null) {
      filters.push('slot = ?')
      bindings.push(slot)
    }
    if (exclude.length > 0) {
      filters.push(`language NOT IN (${exclude.map(() => '?').join(', ')})`)
      bindings.push(...exclude)
    }
    const where = filters.length > 0 ? ` WHERE ${filters.join(' AND ')}` : ''
    const statement = env.DB.prepare(
      `SELECT word, language, lang FROM hourly_greetings${where} ORDER BY RANDOM() LIMIT 1`,
    )
    const rows = await (bindings.length > 0 ? statement.bind(...bindings) : statement).all<Greeting>()
    return rows.results[0] ?? null
  }

  return (await draw(avoid)) ?? (avoid.length > 0 ? draw([]) : null)
}

/** The request body as JSON, or `null`: a body that is not JSON is an empty avoid-list. */
async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

async function randomGreeting(request: Request, env: Env): Promise<Response> {
  const body = await jsonBody(request)
  const avoid = cleanAvoid((body as { avoid?: unknown } | null)?.avoid)
  // Which part of the day the caller is in. `null` is a caller that did not say — an app
  // older than this field, or a person with `curl` — and it is answered from the whole
  // table rather than turned away.
  const slot = cleanSlot((body as { when?: unknown } | null)?.when)

  try {
    await ensureGreetings(env)
    // `null` here means one thing only — the table is empty — because `pickGreeting` drops
    // its avoid filter rather than coming back with nothing. So this is where a fresh
    // database, and a table somebody emptied, get the eighty.
    let greeting = await pickGreeting(env, avoid, slot)
    if (greeting === null) {
      await seedGreetings(env)
      greeting = await pickGreeting(env, avoid, slot)
    }
    if (greeting === null) return error('No greetings are stored.', 503)
    return json({ greeting })
  } catch {
    // Whatever went wrong, the answer is the same one the app uses for every other
    // failure: it keeps the word it is already showing, which came out of its own copy of
    // the eighty. Nothing here is worth an error state on a masthead.
    return error('The greetings table could not be read.', 503)
  }
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

  if (pathname === '/api/greeting') {
    if (request.method !== 'POST') return error('POST only.', 405)
    // Before the token check, and deliberately: this is the one route that is not the
    // Shortcut's, the only one the app calls, and the only one with nothing to guard.
    return randomGreeting(request, env)
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
