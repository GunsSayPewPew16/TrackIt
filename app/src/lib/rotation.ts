/**
 * Which language this open shows first, and what it has shown lately.
 *
 * The greeting is the first thing on the dashboard, so the word has to be on screen in the
 * first render, before anything can be asked for or waited on. This file is that half: it
 * picks a word out of `lib/greetings.ts` with no network at all.
 *
 * **The clock is the whole of the choice.** The pool is eighty words and every one of them
 * belongs to a part of the day, so this file first asks `greetingsFor(slot)` for the twenty
 * the hour owns and walks those — a morning shows `Buongiorno` or `Suprabhat` and never
 * `Buonanotte`. There is no coin to toss between a hello and an hour's word, because there
 * are no all-hour hellos left to toss it for: the hour *is* the list. The hour is the
 * **phone's own** (`new Date()`), which is the clock the reader is living by — not the
 * server's, which is in whichever region the Worker runs in.
 *
 * The pick is a shuffled walk rather than a roll of the dice. Every language gets a turn
 * before any of them gets a second one, the order is re-shuffled when it runs out, and the
 * sequence a returning visitor sees is therefore not the list's own order — which matters,
 * because the list is ordered by how many people speak each language and "Mandarin, Hindi,
 * Spanish, French…" would be the same four opens for everybody. **Each part of the day has
 * its own walk**, kept under the name of the hour it belongs to: the afternoon does not
 * inherit the morning's place in the order, because those are different lists of words.
 *
 * **The languages just shown are kept, not just used.** They are what the greeting's server
 * is told to avoid (`hooks/useGreeting.ts` sends them with its question), so the word the
 * table answers with is not one the reader has just seen either. `rememberLanguage` is how
 * that memory learns about an answer from the server, which this file never sees.
 */

import { cleanSlot, greetingsFor, slotOfHour, type DaySlot, type Greeting } from "./greetings"

/** A shuffled `0…length-1`, so a run through the table is not the table's own order. */
function shuffle(length: number): number[] {
  const order = Array.from({ length }, (_, index) => index)
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

type Rotation = {
  /** Which part of the day this walk belongs to: a stored order is only good for its own. */
  slot: DaySlot
  /** The word indexes within `greetingsFor(slot)`, shuffled once and walked in order. */
  order: number[]
  /** How far along `order` this browser has got. */
  at: number
  /** The languages just used, newest first — what the server is asked to avoid. */
  recent: string[]
}

const STORAGE_KEY = "trackit-greeting"

/** How many languages back the server is told to avoid; the pool's own memory is longer. */
const RECENT_KEPT = 8

/**
 * The stored walk as it was written, whatever hour it belongs to — or `null` if what is
 * stored is not a walk this browser can use.
 *
 * Everything is checked rather than trusted: storage is the one place in the app that can
 * hold a value this build never wrote (a browser that was open across a change to the
 * table), so a walk is only read back if its hour is one of the four, its order is the
 * length of that hour's list, it stays inside it, and its place is a place in it. Anything
 * else is a fresh start rather than an error, and nothing is salvaged — the second guess
 * would be a language the reader may have just been shown.
 */
function readStored(): Rotation | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return null
    const store = parsed as Record<string, unknown>
    const slot = cleanSlot(store.slot)
    if (slot === null) return null
    const length = greetingsFor(slot).length
    const order = Array.isArray(store.order) ? store.order : []
    if (order.length !== length) return null
    if (!order.every((value) => Number.isInteger(value) && value >= 0 && value < length)) return null
    if (typeof store.at !== "number" || store.at < 0 || store.at >= order.length) return null
    const recent = Array.isArray(store.recent) ? store.recent.filter((v): v is string => typeof v === "string") : []
    return { slot, order, at: store.at, recent: recent.slice(0, RECENT_KEPT) }
  } catch {
    // A browser that refuses storage costs the bookkeeping, never the greeting.
    return null
  }
}

/** The stored walk, if it is one this hour can still walk: the same slot, and intact. */
function readRotation(slot: DaySlot): Rotation | null {
  const stored = readStored()
  return stored !== null && stored.slot === slot ? stored : null
}

function writeRotation(next: Rotation): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // A browser that refuses storage: carry on with this open's word and let the next open
    // pick its own.
  }
}

/**
 * This open's greeting from the pool, and the languages the server should avoid.
 *
 * Called once per load — it *advances* the rotation as a side effect, so calling it on
 * every render would put the pool in fast-forward.
 */
export function openGreeting(
  /** Which part of the day the phone is in; `openGreeting()` reads its own clock. */
  slot: DaySlot = slotOfHour(new Date().getHours()),
): { greeting: Greeting; slot: DaySlot; avoid: string[] } {
  const words = greetingsFor(slot)
  const stored = readRotation(slot)
  const order = stored?.order ?? shuffle(words.length)
  const at = stored?.at ?? 0

  /*
   * The word this open shows, and where the next open picks up.
   *
   * `at` is always a place in `order` — a fresh walk starts at 0, a stored one is where the
   * last open left it — so the entry is read rather than searched for: there is no filter to
   * skip past, because every word in `words` is a word for this hour by construction. A walk
   * that reaches its end is re-shuffled for the next open, and this open keeps the entry it
   * walked to, which is what keeps the table's own order out of the sequence.
   */
  const greeting = words[order[Math.min(at, order.length - 1)]]
  const spent = at + 1 >= order.length

  const recent = [greeting.language, ...(stored?.recent ?? []).filter((l) => l !== greeting.language)]
  writeRotation({
    slot,
    order: spent ? shuffle(words.length) : order,
    at: spent ? 0 : at + 1,
    recent: recent.slice(0, RECENT_KEPT),
  })

  return { greeting, slot, avoid: recent }
}

/**
 * Note a language the table answered with, so the next open avoids it too.
 *
 * It writes into whatever walk is stored rather than starting one: the answer came from the
 * hour the app is in, so the stored walk is that hour's. A browser with nothing stored has
 * nothing to update — the next open's own pick will remember it, since the pool's pick is
 * the one that gets *written*, and this is only ever called for a word the pool did not
 * choose.
 */
export function rememberLanguage(language: string): void {
  const stored = readStored()
  if (stored === null) return
  writeRotation({
    ...stored,
    recent: [language, ...stored.recent.filter((name) => name !== language)].slice(0, RECENT_KEPT),
  })
}
