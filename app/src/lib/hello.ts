/**
 * Saying hello in a language the pool does not have.
 *
 * `lib/greetings.ts` is the greeting's floor: thirty-six languages, instantly, offline,
 * with no key anywhere. This file is the ceiling — one short question to a model per app
 * open, for a language and a romanization the pool never thought of — and it is written
 * as something that can fail silently, because a greeting is not worth an error state.
 * What is *asked* and what an answer has to look like before it is shown are not here:
 * they are `lib/gemini.ts`, because the server asks the same question
 * (`app/api/greeting.ts`) and one of the two must not drift from the other.
 *
 * **The key is the hard part, and it is not in this repository.** The site is a static
 * build published to GitHub Pages: anything compiled into it is public, and a Google AI
 * Studio key in a public bundle is a key anyone can spend. So there are exactly two ways
 * in, and neither one ships a secret:
 *
 * 1. **Bring your own key.** Visit the app once with `?gemini_key=…` on the URL;
 *    `rememberKeyFromUrl` stores it in this browser's `localStorage` and takes it back
 *    out of the address bar, so it is not in the history, a bookmark or a shared link.
 *    That browser then gets model greetings; every other device falls back to the pool.
 * 2. **A server-side proxy.** Build with `VITE_GREETING_ENDPOINT=/api/greeting` (or any
 *    absolute URL) and the app posts `{ avoid: [...] }` there instead, expecting
 *    `{ greeting: { word, language, lang } }` back. The key lives in the host's
 *    environment — the Vercel function in `app/api/greeting.ts`, or the Cloudflare Worker
 *    in `backend/` — and never reaches the browser. That is the only shape in which
 *    *every* visitor gets a model greeting, and the README's *Deploying* section is how it
 *    is set up.
 *
 * Google's own key documentation says the same thing in as many words: do not expose a
 * key in client-side production code, and for a public app use a proxy.
 */

import { askGemini, TIMEOUT_MS } from "./gemini"
import { validateGreeting, type Greeting } from "./greetings"

/** The proxy, when the build was given one. Empty string and undefined are the same. */
const ENDPOINT: string | null = import.meta.env.VITE_GREETING_ENDPOINT?.trim() || null

/** Where a pasted key is kept. This browser only, never the repository. */
export const KEY_STORAGE = "trackit-gemini-key"

/** The key this browser was given, if any. */
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
 * Called once, before the app renders. The `replaceState` is the point of the exercise:
 * a key left in the address bar ends up in the browser's history, in any bookmark the
 * owner makes, and in a screenshot of the app.
 */
export function rememberKeyFromUrl(): void {
  const url = new URL(window.location.href)
  const pasted = url.searchParams.get("gemini_key")?.trim()
  if (!pasted) return
  try {
    window.localStorage.setItem(KEY_STORAGE, pasted)
  } catch {
    // Nowhere to keep it; the app simply keeps using the pool.
  }
  url.searchParams.delete("gemini_key")
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
}

/** Whether this open can ask a model at all — a key here, or a proxy in the build. */
export function hasModel(): boolean {
  return ENDPOINT !== null || geminiKey() !== null
}

/**
 * The proxy's answer, which is the model's word forwarded by a server that holds the key
 * (`app/api/greeting.ts`, or any proxy speaking the same shape).
 *
 * It is validated here as well as there, and that is not redundancy for its own sake: the
 * function is one deployment of one contract, the contract is public, and the thing being
 * protected is not the key but the masthead — a word must be one the serif can draw, or
 * the line reads in two typefaces. A proxy that answered with something else costs the
 * reader nothing, because the pool's word is already on screen behind it.
 */
async function askProxy(endpoint: string, avoid: string[]): Promise<Greeting | null> {
  try {
    const answer = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avoid }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!answer.ok) return null
    const payload: unknown = await answer.json()
    // `{ greeting: … }` is the documented shape; the flat object is accepted too, so a
    // proxy that simply forwards the model's JSON is not a broken proxy.
    return validateGreeting((payload as { greeting?: unknown } | null)?.greeting ?? payload)
  } catch {
    return null
  }
}

/**
 * Ask for a greeting, and answer `null` for every way it can go wrong: no key, no proxy,
 * no network, a refusal, a timeout, a word the serif cannot draw. The caller keeps the
 * pool's word in that case, which is what makes this safe to call on every open.
 *
 * The proxy wins when the build has one, because a build that was pointed at a server was
 * pointed there so that nobody needs a key of their own.
 */
export async function askGreeting(avoid: string[]): Promise<Greeting | null> {
  if (ENDPOINT !== null) return askProxy(ENDPOINT, avoid)
  const key = geminiKey()
  if (key === null) return null
  return askGemini(key, avoid)
}
