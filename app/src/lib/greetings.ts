/**
 * The word the greeting is said in, and the two places it can come from.
 *
 * The dashboard's masthead says hello, and the owner asked for it to say hello in a
 * different language every time the app is opened — French, Spanish, romanized
 * Japanese, romanized Mandarin, and so on. This file is the half that needs no network
 * and no key:
 *
 * - **`GREETINGS` is the pool.** Thirty-six greetings, one per language, each
 *   romanized in latin letters and each *checked against both cuts of Anthropic Serif
 *   Display*, character by character, by `tools/vendor-anthropic-serif.py` — which
 *   fails its run if a word in here carries a letter the face cannot draw. That check
 *   is the point: a missing glyph would be drawn by Georgia while the rest of the word
 *   came from the serif, and one masthead line in two typefaces is worse than a
 *   shorter list.
 * - **`openGreeting`** picks this open's word: a shuffled order kept in
 *   `localStorage`, advanced one entry per open and re-shuffled when it runs out, so
 *   no language repeats until every other one has had a turn and the sequence a
 *   returning visitor sees is not the list's own order. A browser that refuses storage
 *   still gets a different word every open — by chance rather than by bookkeeping.
 * - **`validateGreeting`** is what a *model's* answer has to survive to be shown (see
 *   `lib/hello.ts`): one latin word of a sane length, made only of letters both faces
 *   carry, with a name and a language tag to go with it. A model is not allowed to
 *   write outside the design's font.
 *
 * The name is not here. It is `OWNER_NAME` in `lib/owner.ts`, and the word and the
 * name are put together by `hooks/useGreeting.ts`, which is the one thing that knows
 * a model might have answered too.
 */

export type Greeting = {
  /** The word, comma included: `Bonjour,`. */
  word: string
  /** Its English name — never drawn, but hovered and spoken (see the dashboard's h1). */
  language: string
  /**
   * Its BCP-47 tag. `-Latn` marks the romanized ones: a screen reader that knows the
   * word is Japanese said in latin letters pronounces it better than one that does not.
   */
  lang: string
}

/** Where this open's word came from; the two are drawn identically. */
export type GreetingSource = "pool" | "model"

/**
 * The greeting as the dashboard's heading draws it: the word, whose language it is, and
 * the name it is said to. `hooks/useGreeting.ts` is what puts one together per open, and
 * the heading is the only thing that reads it.
 */
export type GreetingLine = Greeting & {
  name: string
  /** Which side of the app answered — the pool, or a model. Carried as a `data-` mark. */
  source: GreetingSource
}

export const GREETINGS: Greeting[] = [
  { word: "Hello,", language: "English", lang: "en" },
  { word: "Bonjour,", language: "French", lang: "fr" },
  { word: "Hola,", language: "Spanish", lang: "es" },
  { word: "Olá,", language: "Portuguese", lang: "pt" },
  { word: "Ciao,", language: "Italian", lang: "it" },
  { word: "Salve,", language: "Latin", lang: "la" },
  { word: "Hallo,", language: "German", lang: "de" },
  { word: "Halló,", language: "Icelandic", lang: "is" },
  { word: "Hej,", language: "Swedish", lang: "sv" },
  { word: "Hei,", language: "Norwegian", lang: "no" },
  { word: "Tere,", language: "Estonian", lang: "et" },
  { word: "Szia,", language: "Hungarian", lang: "hu" },
  { word: "Ahoj,", language: "Czech", lang: "cs" },
  { word: "Cześć,", language: "Polish", lang: "pl" },
  { word: "Zdravo,", language: "Croatian", lang: "hr" },
  { word: "Pryvit,", language: "Ukrainian", lang: "uk-Latn" },
  { word: "Privet,", language: "Russian", lang: "ru-Latn" },
  { word: "Merhaba,", language: "Turkish", lang: "tr" },
  { word: "Namaste,", language: "Hindi", lang: "hi-Latn" },
  { word: "Nomoshkar,", language: "Bengali", lang: "bn-Latn" },
  { word: "Vanakkam,", language: "Tamil", lang: "ta-Latn" },
  { word: "Namaskaram,", language: "Malayalam", lang: "ml-Latn" },
  { word: "Konnichiwa,", language: "Japanese", lang: "ja-Latn" },
  { word: "Annyeong,", language: "Korean", lang: "ko-Latn" },
  { word: "Nǐ hǎo,", language: "Mandarin Chinese", lang: "zh-Latn" },
  { word: "Sawasdee,", language: "Thai", lang: "th-Latn" },
  { word: "Xin chào,", language: "Vietnamese", lang: "vi" },
  { word: "Selamat,", language: "Indonesian", lang: "id" },
  { word: "Kumusta,", language: "Filipino", lang: "fil" },
  { word: "Aloha,", language: "Hawaiian", lang: "haw" },
  { word: "Marhaba,", language: "Arabic", lang: "ar-Latn" },
  { word: "Salaam,", language: "Persian", lang: "fa-Latn" },
  { word: "Shalom,", language: "Hebrew", lang: "he-Latn" },
  { word: "Jambo,", language: "Swahili", lang: "sw" },
  { word: "Saluton,", language: "Esperanto", lang: "eo" },
  { word: "Dia dhuit,", language: "Irish", lang: "ga" },
]

/**
 * The letters both cuts carry **beyond** Latin-1 and Latin Extended-A, read out of
 * their own `cmap` tables: the caron, macron, breve and ogonek letters that romanized
 * Mandarin, Vietnamese and the Baltic languages are spelled with. Latin-1 and Extended-A
 * are complete in both faces, so they are the ranges in `LETTERS` below; these eighty-nine
 * are the rest of it, and the list is short enough to write out.
 */
const EXTRA = "ǍǎǏǐǑǒǓǔǢǣǦǧǪǫǴǵǸǹǼǽǾǿȘșȚțȧȯȲȳȷɅḂḃḊḋḞḟḠḡḤḥḰḱḲḳḴḵḶḷḻḾḿṀṁṂṃṆṇṔṕṖṗṠṡṢṣṪṫẀẁẂẃẄẅẌẍẞạẸẹỊịỌọỤụỲỳ"

const LETTERS = `A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u00FF\\u0100-\\u017F${EXTRA}`

/** One or two words, letters only, ending in the design's comma: `Nǐ hǎo,`. */
const WORD = new RegExp(`^[${LETTERS}][${LETTERS}'’\\- ]*,$`)

/** Longer than the longest word in the pool ("Shalom aleichem," is 17) by a margin. */
const MAX_WORD = 20

const NAME = /^[A-Za-z][A-Za-z .'-]{1,24}$/
const TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/

/**
 * A greeting, if what arrived really is one — `null` otherwise.
 *
 * It takes an unknown because its caller is a JSON parse of something a model wrote.
 * Everything about the answer is checked rather than trusted: the word is trimmed to
 * one latin word made of letters the serif carries (a longer phrase or an unspelled
 * script is refused, and the pool answers instead), any end punctuation it came with is
 * replaced by the design's own comma, and the language must be a plain English name with
 * a plausible tag. A `null` here is not an error anyone sees: it means the pool's word
 * stands.
 */
export function validateGreeting(input: unknown): Greeting | null {
  if (typeof input !== "object" || input === null) return null
  const candidate = input as Record<string, unknown>

  const spoken = typeof candidate.word === "string" ? candidate.word.trim() : ""
  // The comma belongs to the design, not to the answer: any punctuation the model put
  // at the end is dropped and the italic comma is added once, here.
  const word = `${spoken.replace(/[\s.,!?;:…]+$/u, "")},`
  if (word.length > MAX_WORD || !WORD.test(word)) return null

  const language = typeof candidate.language === "string" ? candidate.language.trim() : ""
  const lang = typeof candidate.lang === "string" ? candidate.lang.trim() : ""
  if (!NAME.test(language) || !TAG.test(lang)) return null

  return { word, language, lang }
}

/** A shuffled `0…length-1`, so a run through the pool is not the pool's own order. */
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
  /** The languages just used, newest first — what a model is asked to avoid. */
  recent: string[]
}

const STORAGE_KEY = "trackit-greeting"

/** How many languages back the model is told to avoid; the pool's own memory is longer. */
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
 * This open's greeting from the pool, and the languages a model should avoid.
 *
 * Called once per load — it *advances* the rotation as a side effect, so calling it on
 * every render would put the pool in fast-forward.
 */
export function openGreeting(): { greeting: Greeting; avoid: string[] } {
  const stored = readRotation()
  // No stored order, or one written by a pool of a different length: start a fresh walk.
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

/** Note a language a model chose, so the next open's model is asked to avoid it too. */
export function rememberLanguage(language: string): void {
  const stored = readRotation()
  if (!stored) return
  writeRotation({
    ...stored,
    recent: [language, ...stored.recent.filter((name) => name !== language)].slice(0, RECENT_KEPT),
  })
}
