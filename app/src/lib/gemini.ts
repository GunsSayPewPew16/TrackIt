/**
 * The one question this app asks a model, and the one place its shape is written down.
 *
 * **Nothing asks it at the moment, and that is deliberate.** The greeting used to be a
 * model's word — first from the owner's own key, then from a function holding one for every
 * visitor — and it is a row drawn out of the `greetings` table in D1 now (`backend/`),
 * because a greeting is data. This module is kept whole and working for whatever asks a
 * model next, together with the parked half of `lib/hello.ts` and the key itself, which
 * lives in a gitignored `.dev.vars` rather than in this repository.
 *
 * When something does ask it, there are two routes and both end here: **the browser**, when
 * the owner has pasted their own key (`lib/hello.ts` keeps it in that browser and nowhere
 * else), and **a server function**, when the key is the deployment's and every visitor is
 * meant to get a model's word (`app/api/greeting.ts`).
 * The request is the same either way — `POST /v1beta/interactions`, the key in
 * `x-goog-api-key`, one sentence in and JSON out — and, more to the point, the *answer*
 * has to be judged the same way on both routes, or the two would drift into accepting
 * different words and only one of them would be checked against the font.
 *
 * So this module is deliberately dull and portable: no `import.meta.env`, no `window`, no
 * DOM, nothing that knows whether it is running in a page or in Node. Everything
 * Vite-specific stays in `lib/hello.ts`; everything that decides *which* language is
 * spoken stays in `lib/greetings.ts`.
 *
 * Two things it deliberately does not do: choose the language (the word the masthead opens
 * with and the list a model is asked to avoid both come from `lib/greetings.ts`, which also
 * cleans that list), and hold a key (each caller holds its own — the browser's, or the
 * deployment's environment).
 */

import { validateGreeting, type Greeting } from "./greetings"

/** A free-tier model, chosen for latency: this runs while the app is opening. */
export const MODEL = "gemini-3.5-flash-lite"

/**
 * The Interactions API. Google's own documentation recommends it for new work over the
 * older `generateContent` endpoint, and `textOf` below still understands that older
 * shape's answer, because a proxy written by someone else may be relaying it.
 */
export const INTERACTIONS = "https://generativelanguage.googleapis.com/v1beta/interactions"

/**
 * How long a model is given, which is a long time on purpose.
 *
 * Nothing waits on this: the pool's word is already on screen and a model's answer only ever
 * replaces it, so the only thing a short timeout can do is throw away a greeting that
 * arrived. **Measured against the real API with a real key** (October 2026,
 * `thinking_level: minimal`): 3.7–9.6 s for this question, with 10–14 s at the model's own
 * default thinking. The 6 s that stood here before that measurement was discarding answers
 * that had already been paid for, and 10 s was still cutting the slow tail — hence: long,
 * because the wait costs the reader nothing.
 *
 * On the server route (`app/api/greeting.ts`) the host may kill the function before this
 * fires. That is not a special case: a platform error is a failed request like any other,
 * the app keeps the pool's word, and the only cost is the model call nobody saw.
 */
export const TIMEOUT_MS = 15_000

/**
 * How much the model is allowed to think before it answers, and the single biggest lever on
 * this call's latency: the same question took **9–14 s** at the model's own default and
 * 0.9–2.3 s at `minimal`. It is one word of JSON about a language, which is what `minimal`
 * is for; `thinking_budget` is the older `generateContent` spelling and is a 400 here.
 */
const THINKING = { thinking_level: "minimal" } as const

/**
 * The shape of the answer, as a schema rather than as a request.
 *
 * The prompt still shows the model what JSON to write, because an example is the cheapest
 * way to ask in a one-shot question — but a schema is what makes the answer an object
 * instead of prose that happens to contain one, and it is why `firstObject` below is a
 * belt to this pair of braces rather than the only thing standing between a model and the
 * masthead.
 */
const SHAPE = {
  type: "text",
  mime_type: "application/json",
  schema: {
    type: "object",
    properties: { word: { type: "string" }, language: { type: "string" }, lang: { type: "string" } },
    required: ["word", "language", "lang"],
  },
} as const

/**
 * What to ask, in one paragraph.
 *
 * The shape of the answer is given as a literal example rather than as a schema: a
 * one-shot question with no follow-up is exactly the case where an example is cheapest
 * and most reliable. The avoid-list is the model's memory of what the reader has just
 * seen, and the last line is there because "pick a language" tends to come back as French
 * over and over.
 */
export function askPrompt(avoid: string[]): string {
  return [
    "You are the greeting line of a small expense tracker.",
    'Answer with JSON only — no prose, no code fence — exactly like this: {"word":"Bonjour","language":"French","lang":"fr"}',
    "`word` is how you say hello in one language, romanized into latin letters, capitalised, with no punctuation: one word, or two at most.",
    "`language` is that language's English name. `lang` is its BCP-47 language tag.",
    avoid.length > 0
      ? `Do not choose any of these, which the reader has just seen: ${avoid.join(", ")}.`
      : "Choose any language at all.",
    "Prefer a language with a few million speakers, and one a reader in India would enjoy meeting.",
  ].join(" ")
}

/** The first JSON object in a string — models fence their answers, or wrap them in a sentence. */
export function firstObject(text: string): unknown {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

/** The text of an answer, in either shape the API has answered in. */
export function textOf(payload: unknown): string {
  const body = payload as {
    steps?: { type?: string; content?: { type?: string; text?: string }[] }[]
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    output_text?: string
  }
  // The Interactions API: the model's own output is a step, its content a list of parts.
  const steps = body.steps ?? []
  const spoken = steps
    .filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("")
  if (spoken) return spoken
  if (typeof body.output_text === "string") return body.output_text
  // Generate Content: the older shape, still what a proxy is likeliest to return.
  return (body.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("")
}

/**
 * Ask the model for a greeting with a key the caller owns, and answer `null` for every way
 * it can go wrong: no network, a refusal, an exhausted quota, a timeout, a word the serif
 * cannot draw. Both callers keep the pool's word in that case, which is what makes this
 * safe to run on every open and safe to expose.
 *
 * `store: false` keeps the question out of the model's own history. What is sent is one
 * sentence and a short list of language names — no money, no rows, nothing about anyone.
 */
export async function askGemini(key: string, avoid: string[]): Promise<Greeting | null> {
  try {
    const answer = await fetch(INTERACTIONS, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        model: MODEL,
        input: askPrompt(avoid),
        store: false,
        generation_config: THINKING,
        response_format: SHAPE,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!answer.ok) return null

    const payload: unknown = await answer.json()
    return validateGreeting(firstObject(textOf(payload)))
  } catch {
    // Offline, blocked by CORS, out of quota, aborted: all the same answer here.
    return null
  }
}
