/**
 * Which of the fifty languages this open shows first, and what it has shown lately.
 *
 * The greeting is the first thing on the dashboard, so the word has to be on screen in the
 * first render, before anything can be asked for or waited on. This file is that half: it
 * picks a word out of `lib/greetings.ts` with no network at all.
 *
 * The pick is a shuffled walk rather than a roll of the dice. Every language gets a turn
 * before any of them gets a second one, the order is re-shuffled when it runs out, and the
 * sequence a returning visitor sees is therefore not the list's own order — which matters,
 * because the list is ordered by how many people speak each language and "English, Mandarin,
 * Hindi, Spanish…" would be the same four opens for everybody. A browser that refuses
 * storage still gets a different word every open, by chance rather than by bookkeeping.
 *
 * **The languages just shown are kept, not just used.** They are what the greeting's server
 * is told to avoid (`hooks/useGreeting.ts` sends them with its question), so the word the
 * table answers with is not one the reader has just seen either. `rememberLanguage` is how
 * that memory learns about an answer from the server, which this file never sees.
 */

import { GREETINGS, type Greeting } from "./greetings"

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
  /** The language indexes, shuffled once and walked in order. */
  order: number[]
  /** How far along `order` this browser has got. */
  at: number
  /** The languages just used, newest first — what the server is asked to avoid. */
  recent: string[]
}

const STORAGE_KEY = "trackit-greeting"

/** How many languages back the server is told to avoid; the pool's own memory is longer. */
const RECENT_KEPT = 8

function readRotation(): Rotation | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return null
    const store = parsed as Record<string, unknown>
    const order = Array.isArray(store.order) ? store.order : []
    if (order.length !== GREETINGS.length) return null
    if (!order.every((value) => Number.isInteger(value) && value >= 0 && value < GREETINGS.length)) {
      return null
    }
    if (typeof store.at !== "number" || store.at < 0 || store.at >= order.length) return null
    const recent = Array.isArray(store.recent) ? store.recent.filter((v) => typeof v === "string") : []
    return { order, at: store.at, recent: recent.slice(0, RECENT_KEPT) }
  } catch {
    // A browser that refuses storage costs the bookkeeping, never the greeting.
    return null
  }
}

function writeRotation(next: Rotation): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // The same: carry on with this open's word and let the next open pick its own.
  }
}

/**
 * This open's greeting from the pool, and the languages the server should avoid.
 *
 * Called once per load — it *advances* the rotation as a side effect, so calling it on
 * every render would put the pool in fast-forward.
 */
export function openGreeting(): { greeting: Greeting; avoid: string[] } {
  const stored = readRotation()
  // No stored order, or one written by a table of a different length: start a fresh walk.
  const order = stored?.order ?? shuffle(GREETINGS.length)
  const at = stored?.at ?? 0
  const greeting = GREETINGS[order[at]]

  const recent = [greeting.language, ...(stored?.recent ?? []).filter((l) => l !== greeting.language)]
  const spent = at + 1 >= order.length
  writeRotation({
    order: spent ? shuffle(GREETINGS.length) : order,
    at: spent ? 0 : at + 1,
    recent: recent.slice(0, RECENT_KEPT),
  })

  return { greeting, avoid: recent }
}

/** Note a language the table answered with, so the next open avoids it too. */
export function rememberLanguage(language: string): void {
  const stored = readRotation()
  if (!stored) return
  writeRotation({
    ...stored,
    recent: [language, ...stored.recent.filter((name) => name !== language)].slice(0, RECENT_KEPT),
  })
}
