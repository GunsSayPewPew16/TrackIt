/**
 * The word the greeting is said in: the table of them, and what qualifies as one.
 *
 * The dashboard's masthead says hello in a different language every time the app is
 * opened. **`GREETINGS` is that list** — the world's fifty most spoken languages, one
 * greeting each, every one of them romanized into latin letters (Mandarin's `Nǐ hǎo`,
 * Burmese's `Mingalaba`, Cantonese's `Nei hou`) so that a single face can draw all of
 * them. Each word is *checked against both cuts of Anthropic Serif Display*, character by
 * character, by `tools/vendor-anthropic-serif.py`, which fails its run if a word here
 * carries a letter the face cannot draw. That check is the point: a missing glyph would be
 * drawn by Georgia while the rest of the word came from the serif, and one masthead line
 * in two typefaces is worse than a shorter list.
 *
 * **This file holds data and rules, and nothing that touches a browser.** The words are
 * served from somewhere else as well — `backend/` keeps them in D1 and seeds that table
 * from this very list, so there is no second copy of the fifty to keep in step — and a
 * Worker has no `window` to reach for. The half that walks the list per open, and the only
 * half that remembers anything, is `lib/rotation.ts`.
 *
 * `validateGreeting` is what an *answer from the greeting's server* has to survive to be
 * shown: one latin word, made only of letters both faces carry, with a name and a language
 * tag to go with it. Nobody is trusted to write outside the design's font — not a model,
 * and not a row somebody added to the database by hand.
 *
 * The name is not here. It is `OWNER_NAME` in `lib/owner.ts`, and the word and the name are
 * put together by `hooks/useGreeting.ts`.
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

/** Which side of the app the word on screen came from; the two are drawn identically. */
export type GreetingSource = "pool" | "server"

/**
 * The greeting as the dashboard's heading draws it: the word, whose language it is, and
 * the name it is said to. `hooks/useGreeting.ts` is what puts one together per open, and
 * the heading is the only thing that reads it.
 */
export type GreetingLine = Greeting & {
  name: string
  /** Whether the table answered or the copy that ships in the bundle did. A `data-` mark. */
  source: GreetingSource
}

/**
 * Fifty hellos, one per language: the most spoken languages in the world, in rough order
 * of how many people speak them. Each is written exactly as the masthead draws it, comma
 * included — the pool is not put through `validateGreeting`, so the comma is a promise
 * this list keeps by hand, and `tools/vendor-anthropic-serif.py` is what checks the rest
 * of it against the faces.
 *
 * Three of them are Arabic and three are Chinese, and that is the languages rather than a
 * whim: Modern Standard, Egyptian and Levantine Arabic are separate languages by their own
 * ISO codes and sound nothing alike, as do Mandarin, Cantonese and Shanghainese. The name
 * is the one a reader would recognise, which is also the name a caller sends back in
 * `avoid` when it has just shown one.
 */
export const GREETINGS: Greeting[] = [
  { word: "Hello,", language: "English", lang: "en" },
  { word: "Nǐ hǎo,", language: "Mandarin Chinese", lang: "zh-Latn" },
  { word: "Namaste,", language: "Hindi", lang: "hi-Latn" },
  { word: "Hola,", language: "Spanish", lang: "es" },
  { word: "Bonjour,", language: "French", lang: "fr" },
  { word: "Marhaba,", language: "Modern Standard Arabic", lang: "ar-Latn" },
  { word: "Nomoshkar,", language: "Bengali", lang: "bn-Latn" },
  { word: "Olá,", language: "Portuguese", lang: "pt" },
  { word: "Privet,", language: "Russian", lang: "ru-Latn" },
  { word: "Salaam,", language: "Urdu", lang: "ur-Latn" },
  { word: "Selamat,", language: "Indonesian", lang: "id" },
  { word: "Hallo,", language: "German", lang: "de" },
  { word: "Konnichiwa,", language: "Japanese", lang: "ja-Latn" },
  { word: "How you dey,", language: "Nigerian Pidgin", lang: "pcm" },
  { word: "Ahlan,", language: "Egyptian Arabic", lang: "arz-Latn" },
  { word: "Namaskar,", language: "Marathi", lang: "mr-Latn" },
  { word: "Namaskaram,", language: "Telugu", lang: "te-Latn" },
  { word: "Merhaba,", language: "Turkish", lang: "tr" },
  { word: "Vanakkam,", language: "Tamil", lang: "ta-Latn" },
  { word: "Nei hou,", language: "Cantonese", lang: "yue-Latn" },
  { word: "Xin chào,", language: "Vietnamese", lang: "vi" },
  { word: "Kumusta,", language: "Filipino", lang: "fil" },
  { word: "Nong hao,", language: "Shanghainese", lang: "wuu-Latn" },
  { word: "Salaam,", language: "Persian", lang: "fa-Latn" },
  { word: "Annyeong,", language: "Korean", lang: "ko-Latn" },
  { word: "Sannu,", language: "Hausa", lang: "ha" },
  { word: "Sawasdee,", language: "Thai", lang: "th-Latn" },
  { word: "Kem cho,", language: "Gujarati", lang: "gu-Latn" },
  { word: "Jambo,", language: "Swahili", lang: "sw" },
  { word: "Pranam,", language: "Bhojpuri", lang: "bho-Latn" },
  { word: "Marhaba,", language: "Levantine Arabic", lang: "apc-Latn" },
  { word: "Li ho,", language: "Hokkien", lang: "nan-Latn" },
  { word: "Ciao,", language: "Italian", lang: "it" },
  { word: "Cześć,", language: "Polish", lang: "pl" },
  { word: "Namaskara,", language: "Kannada", lang: "kn-Latn" },
  { word: "Halo,", language: "Javanese", lang: "jv" },
  { word: "Salam,", language: "Malay", lang: "ms" },
  { word: "Pryvit,", language: "Ukrainian", lang: "uk-Latn" },
  { word: "Bawo,", language: "Yoruba", lang: "yo" },
  { word: "Mingalaba,", language: "Burmese", lang: "my-Latn" },
  { word: "Sat sri akal,", language: "Punjabi", lang: "pa-Latn" },
  { word: "Bună,", language: "Romanian", lang: "ro" },
  { word: "Hallo,", language: "Dutch", lang: "nl" },
  { word: "Namaste,", language: "Nepali", lang: "ne-Latn" },
  { word: "Salam,", language: "Uyghur", lang: "ug-Latn" },
  { word: "Susadei,", language: "Khmer", lang: "km-Latn" },
  { word: "Ndeewo,", language: "Igbo", lang: "ig" },
  { word: "Selam,", language: "Amharic", lang: "am-Latn" },
  { word: "Akkam,", language: "Oromo", lang: "om" },
  { word: "Salaam,", language: "Sindhi", lang: "sd-Latn" },
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

/** Longer than the longest word in the table ("How you dey," is 12) by a margin. */
const MAX_WORD = 20

const NAME = /^[A-Za-z][A-Za-z .'-]{1,24}$/
const TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/

/**
 * How many languages back a caller is told to avoid. The pool's own memory is longer.
 *
 * The limit is part of the greeting's protocol rather than of any one server: it is what
 * an `avoid` list is *allowed* to be, and every side of this feature — the app building
 * one, the Worker reading one out of a request body — agrees on it here.
 */
export const AVOID_MAX = 8

/** And how long any one of those names may be, so a request cannot carry an essay. */
const AVOID_LENGTH = 40

/**
 * An avoid-list as it arrived, reduced to something a query or a prompt can safely carry.
 *
 * Its caller is a JSON body from the network, so nothing about it is assumed: not that it
 * is an array, not that its entries are strings, not that there are few of them or that
 * any one is short. Whatever survives is a list of language names, which is the only thing
 * either the database or the prompt can use.
 */
export function cleanAvoid(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((name): name is string => typeof name === "string")
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && name.length <= AVOID_LENGTH)
    .slice(0, AVOID_MAX)
}

/**
 * A greeting, if what arrived really is one — `null` otherwise.
 *
 * It takes an unknown because its caller is a JSON parse of an answer that crossed the
 * network. Everything about the answer is checked rather than trusted: the word is trimmed
 * to one latin word made of letters the serif carries (a longer phrase or an unspelled
 * script is refused, and the pool answers instead), any end punctuation it came with is
 * replaced by the design's own comma, and the language must be a plain English name with
 * a plausible tag. A `null` here is not an error anyone sees: it means the pool's word
 * stands.
 */
export function validateGreeting(input: unknown): Greeting | null {
  if (typeof input !== "object" || input === null) return null
  const candidate = input as Record<string, unknown>

  const spoken = typeof candidate.word === "string" ? candidate.word.trim() : ""
  // The comma belongs to the design, not to the answer: any punctuation the server put
  // at the end is dropped and the italic comma is added once, here.
  const word = `${spoken.replace(/[\s.,!?;:…]+$/u, "")},`
  if (word.length > MAX_WORD || !WORD.test(word)) return null

  const language = typeof candidate.language === "string" ? candidate.language.trim() : ""
  const lang = typeof candidate.lang === "string" ? candidate.lang.trim() : ""
  if (!NAME.test(language) || !TAG.test(lang)) return null

  return { word, language, lang }
}
