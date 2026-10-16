import { useEffect, useState } from "react"

import { openGreeting, rememberLanguage, type Greeting, type GreetingLine, type GreetingSource } from "@/lib/greetings"
import { askGreeting, hasModel } from "@/lib/hello"
import { OWNER_NAME } from "@/lib/owner"

/**
 * The whole greeting line, for one open of the app.
 *
 * Three things are true of it at once, and that is the design:
 *
 * - **The pool's word is there on the first render**, before anything can be waited for.
 *   The greeting is the first thing a reader looks at, and a masthead that fills in
 *   late — or flickers from one language to another — would be worse than a language
 *   the model did not choose.
 * - **A model's word replaces it if a model was asked and answered** (see
 *   `lib/hello.ts`: the key is the owner's, in this browser, or a server proxy the build
 *   was pointed at). It is asked *once per open*, not per render, and it is never the
 *   only thing standing between the reader and a greeting.
 * - **The name is always the owner's**, from `lib/owner.ts`, in the roman cut while the
 *   word wears the italic.
 *
 * `source` is which of the two the word on screen came from. Nothing draws it — the
 * heading carries it as a `data-` attribute, which is how the difference can be checked
 * in a browser without the design showing it.
 */

/**
 * The question, asked at most once per load *through the module*, not through the
 * component: React runs an effect twice in development (`StrictMode`), and a greeting
 * is not worth two requests or two languages in one open.
 */
let asked: Promise<Greeting | null> | null = null

export function useGreeting(): GreetingLine {
  const [opened] = useState(openGreeting)
  const [line, setLine] = useState<{ greeting: Greeting; source: GreetingSource }>({
    greeting: opened.greeting,
    source: "pool",
  })

  useEffect(() => {
    if (!hasModel()) return
    let live = true
    asked ??= askGreeting(opened.avoid)
    void asked.then((answer) => {
      if (answer === null || !live) return
      rememberLanguage(answer.language)
      setLine({ greeting: answer, source: "model" })
    })
    return () => {
      live = false
    }
  }, [opened])

  return { ...line.greeting, name: OWNER_NAME, source: line.source }
}
