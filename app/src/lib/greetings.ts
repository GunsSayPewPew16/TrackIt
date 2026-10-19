/**
 * The word the greeting is said in: the table of them, and what qualifies as one.
 *
 * The dashboard's masthead says hello in a different language every time the app is opened,
 * and **the hour chooses, from a word that belongs to it**: every greeting in `GREETINGS`
 * carries a `when` — `Buongiorno` in the morning, `Buonasera` in the evening — so there is no
 * all-hour hello in the pool at all. It was fifty hellos that worked at any hour and a
 * handful of words the clock owned; the owner asked for the clock to own all of it, and for
 * **twenty words per part of the day**, which is eighty words over four hours of the day.
 *
 * The twenty languages are the same in every slot, so each hour has the same breadth as any
 * other, and eight of them the owner asked for by name: Italian, Mandarin, German, French,
 * Malay, Thai, Hindi and Nigerian Pidgin. The other twelve are the world's most spoken
 * languages that have a word of their own for each part of the day.
 *
 * **Some languages fold two parts of the day into one word**, and the repeats are the
 * languages rather than an oversight: Spanish and Portuguese say `Buenas noches` / `Boa
 * noite` for the whole of the evening and the night, and Arabic says `Masa al-khayr` for both
 * the afternoon and the evening. It is the same word at both ends of its part of the day, so
 * it is written twice, in the two slots it is true in.
 *
 * Each word is romanized into the latin letters the masthead is set in and **keeps its own
 * accents**, Mandarin's tone marks included (`Zǎo shang hǎo`, `Günaydın`, `Dobré ráno`,
 * `God kväll`). The tone marks were off for a while, at the owner's own asking, and they
 * asked for them back: `ǎ`, `ǔ` and `ā` are letters the serif draws, and a pinyin without
 * them is a spelling a Mandarin reader has to reconstruct.
 *
 * Every word is *checked against both cuts of Anthropic Serif Display*, character by
 * character, by `tools/vendor-anthropic-serif.py`, which fails its run if a word here carries
 * a letter the face cannot draw. That check is the point: a missing glyph would be drawn by
 * Georgia while the rest of the word came from the serif, and one masthead line in two
 * typefaces is worse than a shorter list.
 *
 * **This file holds data and rules, and nothing that touches a browser.** The words are
 * served from somewhere else as well — `backend/` keeps them in D1 and seeds that table from
 * this very list, so there is no second copy of the eighty to keep in step — and a Worker has
 * no `window` to reach for. The half that walks the list per open, and the only half that
 * remembers anything, is `lib/rotation.ts`.
 *
 * `validateGreeting` is what an *answer from the greeting's server* has to survive to be
 * shown: one latin word, accented or not, made only of letters both faces carry, with a name
 * and a language tag to go with it. Nobody is trusted to write outside the design's font —
 * not a model, and not a row somebody added to the database by hand.
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
  /**
   * Which part of the day the word belongs to. Every word in `GREETINGS` has one; it is
   * optional only because a server's answer is validated without the caller knowing what
   * hour the app is in.
   */
  when?: DaySlot
}

/**
 * The four parts of the day, as the phone's own clock divides them.
 *
 * The boundaries are the ones a person would draw rather than the ones a clock would:
 * morning is `05:00–11:59`, afternoon `12:00–16:59`, evening `17:00–21:59` and night
 * `22:00–04:59`, so a word for the evening is never shown at 3am and "good morning" is
 * never said at midnight. `slotOfHour` is the only place they are written down.
 */
export type DaySlot = "morning" | "afternoon" | "evening" | "night"

/** Every part of the day, in the order the clock visits them. */
export const DAY_SLOTS: DaySlot[] = ["morning", "afternoon", "evening", "night"]

/** Which part of the day the given hour falls in, 0–23 being a clock's own hour. */
export function slotOfHour(hour: number): DaySlot {
  if (hour >= 5 && hour < 12) return "morning"
  if (hour >= 12 && hour < 17) return "afternoon"
  if (hour >= 17 && hour < 22) return "evening"
  return "night"
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
 * Eighty words: **twenty languages, and a word for every part of the day in each**, grouped
 * by language so that one language's four words are read together and a gap is easy to see.
 *
 * The owner's own list is in it — Italian, Mandarin, German, French, Malay, Thai, Hindi,
 * Nigerian Pidgin — and the rest are the most spoken languages that say something different
 * morning, noon, dusk and night. Each word is written exactly as the masthead draws it, comma
 * included; the pool is not put through `validateGreeting`, so the comma is a promise this
 * list keeps by hand, and `tools/vendor-anthropic-serif.py` is what checks the rest of it
 * against the faces. The longest word here is Malay's `Selamat tengah hari,` at twenty
 * characters, which is exactly `MAX_WORD` below.
 */
export const GREETINGS: Greeting[] = [
  // The tone marks are the owner's own asking, twice: off once, and back on when they missed
  // them (`Zǎo shang hǎo`, 早上好).
  { word: "Zǎo shang hǎo,", language: "Mandarin Chinese", lang: "zh-Latn", when: "morning" },
  { word: "Xià wǔ hǎo,", language: "Mandarin Chinese", lang: "zh-Latn", when: "afternoon" },
  { word: "Wǎn shang hǎo,", language: "Mandarin Chinese", lang: "zh-Latn", when: "evening" },
  { word: "Wǎn ān,", language: "Mandarin Chinese", lang: "zh-Latn", when: "night" },

  { word: "Suprabhat,", language: "Hindi", lang: "hi-Latn", when: "morning" },
  { word: "Namaskar,", language: "Hindi", lang: "hi-Latn", when: "afternoon" },
  { word: "Shubh sandhya,", language: "Hindi", lang: "hi-Latn", when: "evening" },
  { word: "Shubh ratri,", language: "Hindi", lang: "hi-Latn", when: "night" },

  { word: "Buenos días,", language: "Spanish", lang: "es", when: "morning" },
  { word: "Buenas tardes,", language: "Spanish", lang: "es", when: "afternoon" },
  // One word for the whole of the evening and the night: see the header.
  { word: "Buenas noches,", language: "Spanish", lang: "es", when: "evening" },
  { word: "Buenas noches,", language: "Spanish", lang: "es", when: "night" },

  { word: "Bonjour,", language: "French", lang: "fr", when: "morning" },
  { word: "Bon après-midi,", language: "French", lang: "fr", when: "afternoon" },
  { word: "Bonsoir,", language: "French", lang: "fr", when: "evening" },
  { word: "Bonne nuit,", language: "French", lang: "fr", when: "night" },

  { word: "Sabah al-khayr,", language: "Modern Standard Arabic", lang: "ar-Latn", when: "morning" },
  { word: "Masa al-khayr,", language: "Modern Standard Arabic", lang: "ar-Latn", when: "afternoon" },
  { word: "Masa al-khayr,", language: "Modern Standard Arabic", lang: "ar-Latn", when: "evening" },
  { word: "Layla sa'ida,", language: "Modern Standard Arabic", lang: "ar-Latn", when: "night" },

  { word: "Bom dia,", language: "Portuguese", lang: "pt", when: "morning" },
  { word: "Boa tarde,", language: "Portuguese", lang: "pt", when: "afternoon" },
  { word: "Boa noite,", language: "Portuguese", lang: "pt", when: "evening" },
  { word: "Boa noite,", language: "Portuguese", lang: "pt", when: "night" },

  { word: "Dobroye utro,", language: "Russian", lang: "ru-Latn", when: "morning" },
  { word: "Dobryy den,", language: "Russian", lang: "ru-Latn", when: "afternoon" },
  { word: "Dobryy vecher,", language: "Russian", lang: "ru-Latn", when: "evening" },
  { word: "Dobroy nochi,", language: "Russian", lang: "ru-Latn", when: "night" },

  { word: "Guten Morgen,", language: "German", lang: "de", when: "morning" },
  { word: "Guten Tag,", language: "German", lang: "de", when: "afternoon" },
  { word: "Guten Abend,", language: "German", lang: "de", when: "evening" },
  { word: "Gute Nacht,", language: "German", lang: "de", when: "night" },

  { word: "Ohayou,", language: "Japanese", lang: "ja-Latn", when: "morning" },
  { word: "Konnichiwa,", language: "Japanese", lang: "ja-Latn", when: "afternoon" },
  { word: "Konbanwa,", language: "Japanese", lang: "ja-Latn", when: "evening" },
  { word: "Oyasumi,", language: "Japanese", lang: "ja-Latn", when: "night" },

  { word: "Buongiorno,", language: "Italian", lang: "it", when: "morning" },
  { word: "Buon pomeriggio,", language: "Italian", lang: "it", when: "afternoon" },
  { word: "Buonasera,", language: "Italian", lang: "it", when: "evening" },
  { word: "Buonanotte,", language: "Italian", lang: "it", when: "night" },

  { word: "Selamat pagi,", language: "Malay", lang: "ms", when: "morning" },
  { word: "Selamat tengah hari,", language: "Malay", lang: "ms", when: "afternoon" },
  { word: "Selamat petang,", language: "Malay", lang: "ms", when: "evening" },
  { word: "Selamat malam,", language: "Malay", lang: "ms", when: "night" },

  { word: "Sawatdee ton chao,", language: "Thai", lang: "th-Latn", when: "morning" },
  { word: "Sawatdee ton bai,", language: "Thai", lang: "th-Latn", when: "afternoon" },
  { word: "Sawatdee ton yen,", language: "Thai", lang: "th-Latn", when: "evening" },
  { word: "Ratri sawat,", language: "Thai", lang: "th-Latn", when: "night" },

  { word: "Günaydın,", language: "Turkish", lang: "tr", when: "morning" },
  { word: "İyi günler,", language: "Turkish", lang: "tr", when: "afternoon" },
  { word: "İyi akşamlar,", language: "Turkish", lang: "tr", when: "evening" },
  { word: "İyi geceler,", language: "Turkish", lang: "tr", when: "night" },

  { word: "Habari za asubuhi,", language: "Swahili", lang: "sw", when: "morning" },
  { word: "Habari za mchana,", language: "Swahili", lang: "sw", when: "afternoon" },
  { word: "Habari za jioni,", language: "Swahili", lang: "sw", when: "evening" },
  { word: "Usiku mwema,", language: "Swahili", lang: "sw", when: "night" },

  { word: "Goedemorgen,", language: "Dutch", lang: "nl", when: "morning" },
  { word: "Goedemiddag,", language: "Dutch", lang: "nl", when: "afternoon" },
  { word: "Goedenavond,", language: "Dutch", lang: "nl", when: "evening" },
  { word: "Goedenacht,", language: "Dutch", lang: "nl", when: "night" },

  { word: "Kalimera,", language: "Greek", lang: "el-Latn", when: "morning" },
  { word: "Kalispera,", language: "Greek", lang: "el-Latn", when: "afternoon" },
  { word: "Kalo vrady,", language: "Greek", lang: "el-Latn", when: "evening" },
  { word: "Kalinychta,", language: "Greek", lang: "el-Latn", when: "night" },

  { word: "Dobré ráno,", language: "Czech", lang: "cs", when: "morning" },
  { word: "Dobré odpoledne,", language: "Czech", lang: "cs", when: "afternoon" },
  { word: "Dobrý večer,", language: "Czech", lang: "cs", when: "evening" },
  { word: "Dobrou noc,", language: "Czech", lang: "cs", when: "night" },

  { word: "God morgon,", language: "Swedish", lang: "sv", when: "morning" },
  { word: "God eftermiddag,", language: "Swedish", lang: "sv", when: "afternoon" },
  { word: "God kväll,", language: "Swedish", lang: "sv", when: "evening" },
  { word: "God natt,", language: "Swedish", lang: "sv", when: "night" },

  { word: "God morgen,", language: "Norwegian", lang: "nb", when: "morning" },
  { word: "God ettermiddag,", language: "Norwegian", lang: "nb", when: "afternoon" },
  { word: "God kveld,", language: "Norwegian", lang: "nb", when: "evening" },
  { word: "God natt,", language: "Norwegian", lang: "nb", when: "night" },

  // Pidgin says the English words and means them its own way; the particle (`Good morning
  // o`) is what a Nigerian would actually write, and the plain form is what a masthead set
  // in a serif can carry without looking like a typo.
  { word: "Good morning,", language: "Nigerian Pidgin", lang: "pcm", when: "morning" },
  { word: "Good afternoon,", language: "Nigerian Pidgin", lang: "pcm", when: "afternoon" },
  { word: "Good evening,", language: "Nigerian Pidgin", lang: "pcm", when: "evening" },
  { word: "Good night,", language: "Nigerian Pidgin", lang: "pcm", when: "night" },
]

/**
 * The words a part of the day has: the twenty the clock is allowed to draw from, in the
 * order the table lists them.
 *
 * This is the pool the masthead opens with — `lib/rotation.ts` shuffles it and walks it —
 * and the Worker's `when` filter is the same idea on the other side of the network: a word
 * asked for at 8am is a morning word there too.
 */
export function greetingsFor(slot: DaySlot): Greeting[] {
  return GREETINGS.filter((greeting) => greeting.when === slot)
}

/**
 * A part of the day as a request carried it, or `null` if it named something else.
 *
 * Its caller is a JSON body from the network, so nothing about it is assumed: the field is
 * a word the app owns, and a body that spells it differently — or leaves it out — is not an
 * error, it is a caller who did not say which hour it is in.
 */
export function cleanSlot(input: unknown): DaySlot | null {
  return typeof input === "string" && (DAY_SLOTS as string[]).includes(input) ? (input as DaySlot) : null
}

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

/** Longer than the longest word in the table (Malay's "Selamat tengah hari," is 20). */
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
 *
 * Eight names is a third of the languages in one hour, so a caller that has seen all of
 * them is asking the server for nothing; `backend/index.ts` drops the filter rather than
 * refusing to draw in that case.
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
 * The word as it will be drawn: one line, no surrounding space, and **its accents kept**.
 *
 * It used to strip every diacritic, because the masthead was set in plain letters only.
 * The owner asked for the accents back (`Günaydın`, `Dobré ráno`, and Mandarin's `Zǎo shang
 * hǎo`), so this is a *normalizer* now rather than a flattening: `NFC` so a decomposed
 * `e` + acute and a single `é` are one character and one lookup in the face.
 */
function normalizedWord(word: string): string {
  return word.normalize("NFC").replace(/\s+/g, " ").trim()
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
 *
 * The part of the day an answer claims is **read but not trusted**: `when` is optional on
 * the way in, because the app already knows which hour it is in and asked for that hour's
 * word (`lib/hello.ts`), and a server that answers with another hour's word is a server
 * whose answer is dropped rather than one that gets to change the design.
 */
export function validateGreeting(input: unknown): Greeting | null {
  if (typeof input !== "object" || input === null) return null
  const candidate = input as Record<string, unknown>

  const spoken = typeof candidate.word === "string" ? normalizedWord(candidate.word) : ""
  // The comma belongs to the design, not to the answer: any punctuation the server put
  // at the end is dropped and the italic comma is added once, here.
  const word = `${spoken.replace(/[\s.,!?;:…]+$/u, "")},`
  if (word.length > MAX_WORD || !WORD.test(word)) return null

  const language = typeof candidate.language === "string" ? candidate.language.trim() : ""
  const lang = typeof candidate.lang === "string" ? candidate.lang.trim() : ""
  if (!NAME.test(language) || !TAG.test(lang)) return null

  return { word, language, lang }
}
