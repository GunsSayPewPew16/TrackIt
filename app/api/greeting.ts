/**
 * POST /api/greeting — the greeting's model, behind a server so a key can live somewhere.
 *
 * **Parked, and not deployed by anything today.** The greeting's server is the Worker in
 * `backend/` now, which draws a row out of the `greetings` table in D1 and needs no key at
 * all; nothing points here, and the app's `VITE_GREETING_ENDPOINT` is aimed at the Worker.
 * This file is kept because it is the whole of "ask a model from a server" — the key, the
 * origin check, the rationing — and that is what a future feature will want to copy. If it
 * is ever wired up again, it needs `GEMINI_API_KEY` in the host's environment and the app
 * pointed at it, and nothing else about it has changed.
 *
 * A static build cannot hold a key: whatever is compiled into it is public, and a Google
 * AI Studio key in a public bundle is a key anyone can spend. So the app is pointed at
 * this function instead (`VITE_GREETING_ENDPOINT`), the key is a variable in the host's
 * environment, and what comes back is a language — nothing here knows anything about
 * anyone's money.
 *
 * **Where it runs.** Vercel builds every supported source file in the project's root
 * `api/` directory into one function, and this project's root directory *is* `app/`, so
 * this file is served at `/api/greeting` **from the same origin as the site**. That is the
 * whole reason it is here rather than in `backend/`, the Worker that is the Shortcut's
 * endpoint: same-origin means no CORS, no second deployment to keep in step, and no
 * redeploy of the site to change the greeting's model. A site served from somewhere else
 * (GitHub Pages, say) can still call it — that is what `GREETING_ORIGINS` is for.
 *
 * **What it will not do.** It is not a general proxy for the model: the only thing a
 * caller can say is which languages *not* to pick, and the question is
 * `askPrompt` in `src/lib/gemini.ts` — the same one the browser asks when the owner has
 * brought their own key. The word is judged by the same `validateGreeting` the app uses,
 * so a model cannot write outside the design's font.
 *
 * **And it is rationed.** The endpoint is public by necessity — the key is withheld by
 * holding it here, not by holding the door — so every caller is limited per minute and so
 * is everybody together, and a caller over its limit gets a 429 the app treats exactly
 * like any other failure: the pool's word stands. The bookkeeping is a `Map` in the
 * function's own memory: it counts what one instance saw, a cold start forgets it, and a
 * burst spread across instances sees a fraction of itself. That is enough to make a loop
 * or a stray crawler pointless and to keep the day's free quota from being spent by one
 * script; it is not a firewall, and a determined flood would want one (a WAF rule, or a
 * shared counter) in front of it. A greeting is worth neither, until it is.
 */

import { askGemini } from "../src/lib/gemini"
import { cleanAvoid } from "../src/lib/greetings"

type Environment = {
  /** The deployment's own key. Set it in the host's environment; never in this repository. */
  GEMINI_API_KEY?: string
  /**
   * Extra origins allowed to call this function, comma-separated — needed only when the
   * site is served from somewhere else. A site and its function on one origin need none:
   * the function's own origin is always allowed.
   */
  GREETING_ORIGINS?: string
}

/**
 * Vercel hands a function its variables on `process.env`.
 *
 * Read through `globalThis` rather than the bare global because the app's own
 * `tsconfig.json` lists only `vite/client` in `types` — deliberately, so that no file in
 * `src/` can reach for a Node global — and this is the one file in the project that has
 * one at all.
 */
function environment(): Environment {
  const runtime = globalThis as { process?: { env?: Record<string, string | undefined> } }
  const env = runtime.process?.env ?? {}
  return { GEMINI_API_KEY: env.GEMINI_API_KEY, GREETING_ORIGINS: env.GREETING_ORIGINS }
}

/** The origins this function answers over and above its own. */
function extraOrigins(env: Environment): string[] {
  return (env.GREETING_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
}

/** Who asked, and whether they are allowed to. */
function caller(request: Request, env: Environment): { origin: string | null; permitted: boolean } {
  const origin = request.headers.get("Origin")
  // No Origin at all is not a browser: curl, a health check, the owner trying it by hand.
  if (origin === null) return { origin: null, permitted: true }
  const mine = new URL(request.url).origin
  return { origin, permitted: origin === mine || extraOrigins(env).includes(origin) }
}

function headers(origin: string | null): Record<string, string> {
  // Nothing may cache a greeting: the point of the question is that the answer is
  // different every time it is asked.
  const base: Record<string, string> = { "Cache-Control": "no-store" }
  if (origin === null) return base
  return {
    ...base,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    // The answer depends on who asked, so no cache may hand one origin's answer — and its
    // `Allow-Origin` — to another.
    Vary: "Origin",
  }
}

function json(body: unknown, status: number, origin: string | null, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...headers(origin), ...extra } })
}

/**
 * How much of a public endpoint anyone may have.
 *
 * The app asks **once per open**, so twelve a minute is a reader who is reloading to see
 * the language change — the owner, most likely — and generously past what an app open
 * costs. The wider ceiling is what a hundred such readers, or one script pretending to be
 * a hundred, would spend between them.
 */
const PER_CALLER = { limit: 12, windowMs: 60_000 }
const ALL_CALLERS = { limit: 240, windowMs: 60_000 }

/** How many callers are remembered before the memory is swept instead of growing. */
const TRACKED_CALLERS = 5_000

type Window = { count: number; resetAt: number }

const callers = new Map<string, Window>()
let everyone: Window = { count: 0, resetAt: 0 }

/** This caller's request counted, or `null` if the window is full. */
function open(window: Window, now: number, limit: number, windowMs: number): Window | null {
  if (now >= window.resetAt) return { count: 1, resetAt: now + windowMs }
  if (window.count >= limit) return null
  return { count: window.count + 1, resetAt: window.resetAt }
}

/** `Retry-After` is whole seconds, and never zero: zero invites an instant retry. */
const seconds = (ms: number): number => Math.max(1, Math.ceil(ms / 1000))

export type Verdict = { ok: true } | { ok: false; retryAfter: number }

/**
 * Whether this request may be answered, and if not, how long the caller should wait.
 *
 * Exported because it is the one piece of this function that a `Response` cannot be used
 * to judge: a window rolling over takes a minute of real time, and `now` being a parameter
 * is what lets a test step past that boundary rather than wait for it.
 */
export function allow(caller: string, now: number): Verdict {
  const theirs = callers.get(caller) ?? { count: 0, resetAt: 0 }
  const mine = open(theirs, now, PER_CALLER.limit, PER_CALLER.windowMs)
  if (mine === null) return { ok: false, retryAfter: seconds(theirs.resetAt - now) }

  const all = open(everyone, now, ALL_CALLERS.limit, ALL_CALLERS.windowMs)
  if (all === null) return { ok: false, retryAfter: seconds(everyone.resetAt - now) }

  // Only once the map is full is it worth walking: a spent window is the only thing that
  // may be dropped, and a caller that cannot be remembered is still held to the ceiling
  // above it. Both windows are written only when the request is allowed, so a refusal
  // does not extend anyone's wait.
  if (callers.size >= TRACKED_CALLERS) {
    for (const [name, window] of callers) {
      if (now >= window.resetAt) callers.delete(name)
    }
  }
  if (callers.size < TRACKED_CALLERS) callers.set(caller, mine)
  everyone = all
  return { ok: true }
}

/**
 * Who is asking, as far as the platform will say.
 *
 * Vercel puts the client on `x-forwarded-for`, nearest hop first; the other two are what a
 * proxy in front of it would use instead. A request that arrives with none of them is
 * served from one shared bucket named for the situation, which is the only honest thing to
 * do with it — and the ceiling above applies to everybody regardless.
 */
function callerOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return (
    forwarded ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  )
}

export default {
  async fetch(request: Request): Promise<Response> {
    const env = environment()
    const { origin, permitted } = caller(request, env)
    if (!permitted) return json({ error: "Origin not allowed." }, 403, null)

    // A JSON POST is preflighted, so a cross-origin caller asks this before it asks the
    // real question. The header above is the whole answer.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: headers(origin) })
    }
    if (request.method !== "POST") return json({ error: "POST only." }, 405, origin)

    // Before anything that costs: a greeting costs a model call, and this is what keeps
    // one caller — or one script — from being the whole of that cost.
    const verdict = allow(callerOf(request), Date.now())
    if (!verdict.ok) {
      return json({ error: "Too many greetings from here just now." }, 429, origin, {
        "Retry-After": String(verdict.retryAfter),
      })
    }

    const key = env.GEMINI_API_KEY?.trim()
    if (!key) {
      // Not a failure anyone sees: the app keeps the pool's word when this answers badly,
      // and a deployment without a key is a deployment whose greeting is still a greeting.
      return json({ error: "No GEMINI_API_KEY is set for this deployment." }, 503, origin)
    }

    let avoid: string[] = []
    try {
      const body: unknown = await request.json()
      avoid = cleanAvoid((body as { avoid?: unknown } | null)?.avoid)
    } catch {
      // A body that is not JSON is an empty avoid-list, not a refusal: the question can
      // still be asked, it just may repeat a language the reader has just seen.
      avoid = []
    }

    const greeting = await askGemini(key, avoid)
    if (greeting === null) {
      return json({ error: "The model did not answer with a greeting." }, 502, origin)
    }
    return json({ greeting }, 200, origin)
  },
}
