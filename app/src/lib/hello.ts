/**
 * The greeting's server half, seen from the app: one question out, one word back.
 *
 * The masthead greets out of the fifty words that ship in the bundle (`lib/rotation.ts`),
 * instantly and offline. This file is the second source: it asks **the greeting's server**
 * for a row at random, and swaps that word in if — and only if — an answer arrives.
 *
 * **The server is the Worker in `backend/`**, which keeps the words in the `greetings`
 * table in D1 and draws one with `ORDER BY RANDOM()`. It used to be a model (and a Vercel
 * function holding the model's key); it is a table now, because a greeting is data. What it
 * costs is a network round trip on a masthead that is already drawn, and what it buys is
 * that a language can be added, or a romanization fixed, with one `wrangler d1 execute`
 * against the live database instead of a rebuild and a redeploy of the site.
 *
 * **The contract is one way and is unchanged from the model's day**: `POST { avoid: string[]
 * }` in, `{ greeting: { word, language, lang } }` out, anything else and the app keeps the
 * word it is already showing. `avoid` is the languages this browser has just seen
 * (`lib/rotation.ts`), which is what keeps "a different language every open" true now that
 * the choice is a roll of the dice rather than a walk through a shuffled list.
 *
 * **Which server, and how the build is told.** `VITE_GREETING_ENDPOINT`, set at build time.
 * On the Worker's own domain the app and this route share an origin, so a relative
 * `/api/greeting` is the whole configuration; a build served from somewhere else (GitHub
 * Pages, say) points at the Worker's absolute URL and the Worker's CORS headers answer it.
 * **No build without that variable has a server at all**, which is not a broken build: the
 * pool is the greeting, and it is the same fifty words.
 *
 * ## Parked below: the model
 *
 * The owner's Gemini key and the code that asks it are kept here and kept working, because
 * a language model will be wanted for something else in this project. Nothing on the
 * greeting's path calls them: the key is *stored* and never spent, `?gemini_key=…` still
 * takes a key out of the URL and into this browser (`main.tsx` calls `rememberKeyFromUrl`
 * at boot), and `askModel` below is reachable by whatever asks next. The question itself and
 * the parse of its answer are `lib/gemini.ts`, untouched.
 */

import { askGemini } from "./gemini"
import { validateGreeting, type Greeting } from "./greetings"

/** The greeting's server, when the build was given one. Empty string and undefined are the same. */
const ENDPOINT: string | null = import.meta.env.VITE_GREETING_ENDPOINT?.trim() || null

/**
 * How long the table is given to answer, which is short on purpose — and the opposite
 * reasoning to the model's own fifteen seconds (`lib/gemini.ts`).
 *
 * Drawing a row out of fifty is a database read: it is milliseconds, and this runs while
 * the reader is looking at a word that is already right. Something that has not answered in
 * four seconds is not going to improve the masthead, and holding a request open for it is a
 * socket and a promise spent on nothing.
 */
const TIMEOUT_MS = 4_000

/** Whether this build has a greeting server at all. */
export function hasGreetingServer(): boolean {
  return ENDPOINT !== null
}

/**
 * One word from the greeting's server, or `null` for every way it can go wrong: no
 * endpoint, no network, a refusal, a timeout, a word the serif cannot draw.
 *
 * The caller keeps the pool's word in that case, which is what makes this safe to ask on
 * every open and safe to lose. The answer is validated here rather than trusted, because
 * the table is a database anyone with the credentials can add a row to, and the thing being
 * protected is not a secret but the masthead: a word must be one the serif can draw, or the
 * line reads in two typefaces.
 */
export async function greetingFromServer(avoid: string[]): Promise<Greeting | null> {
  if (ENDPOINT === null) return null
  try {
    const answer = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avoid }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!answer.ok) return null
    const payload: unknown = await answer.json()
    // `{ greeting: … }` is the documented shape; the flat object is accepted too, so a
    // server that simply forwards the row is not a broken one.
    return validateGreeting((payload as { greeting?: unknown } | null)?.greeting ?? payload)
  } catch {
    return null
  }
}

/* ------------------------------------------------------- parked: the model */

/** Where a pasted key is kept. This browser only, never the repository. */
export const KEY_STORAGE = "trackit-gemini-key"

/** The key this browser was given, if any. Nothing spends it at the moment. */
export function geminiKey(): string | null {
  try {
    return window.localStorage.getItem(KEY_STORAGE)?.trim() || null
  } catch {
    return null
  }
}

/**
 * Take a key out of the URL, if one is there, and forget the URL had it.
 *
 * Called once, before the app renders. The `replaceState` is the point of the exercise: a
 * key left in the address bar ends up in the browser's history, in any bookmark the owner
 * makes, and in a screenshot of the app.
 */
export function rememberKeyFromUrl(): void {
  const url = new URL(window.location.href)
  const pasted = url.searchParams.get("gemini_key")?.trim()
  if (!pasted) return
  try {
    window.localStorage.setItem(KEY_STORAGE, pasted)
  } catch {
    // Nowhere to keep it; there is nothing waiting on it either way.
  }
  url.searchParams.delete("gemini_key")
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
}

/**
 * Ask the model for a greeting with a key this browser holds. Not on the greeting's path —
 * kept for whatever asks for a model next, and deliberately still here rather than deleted,
 * because the key plumbing (`?gemini_key=…`, `geminiKey`) is the fiddly half and it is
 * already right. Google's own key documentation is the reason it works the way it does: a
 * key must not be compiled into a public bundle, so a browser is only ever given one by
 * whoever is using that browser.
 */
export async function askModel(avoid: string[]): Promise<Greeting | null> {
  const key = geminiKey()
  if (key === null) return null
  return askGemini(key, avoid)
}
