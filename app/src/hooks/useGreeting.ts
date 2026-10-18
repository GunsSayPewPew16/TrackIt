import { useEffect, useState } from "react"

import { useAuth } from "@/hooks/useAuth"
import type { Greeting, GreetingLine, GreetingSource } from "@/lib/greetings"
import { greetingFromServer, hasGreetingServer } from "@/lib/hello"
import { OWNER_NAME } from "@/lib/owner"
import { openGreeting, rememberLanguage } from "@/lib/rotation"

/**
 * The whole greeting line, for one open of the app.
 *
 * Three things are true of it at once, and that is the design:
 *
 * - **A word is there on the first render**, before anything can be waited for. The greeting
 *   is the first thing a reader looks at, and a masthead that fills in late — or flickers
 *   from one language to another — would be worse than a language nobody chose. That word
 *   comes from the fifty in the bundle (`lib/rotation.ts`), which is the only source that
 *   needs no network and no server.
 * - **The greeting's server's word replaces it if one is asked for and arrives**
 *   (`lib/hello.ts`). It is asked *once per open*, not per render, and it is never the only
 *   thing standing between the reader and a greeting: every way it can fail leaves the first
 *   word in place.
 * - **The name belongs to the account**, in the roman cut while the word wears the italic. It
 *   is the signed-in account's own (`lib/profile.ts`), and `OWNER_NAME` only stands in for a
 *   device-only build, which has no account to ask.
 *
 * `source` is which of the two the word on screen came from. Nothing draws it — the heading
 * carries it as a `data-` attribute, which is how the difference can be checked in a browser
 * without the design showing it.
 */

/**
 * The question, asked at most once per load *through the module*, not through the
 * component: React runs an effect twice in development (`StrictMode`), and a greeting is not
 * worth two requests or two languages in one open.
 */
let asked: Promise<Greeting | null> | null = null

export function useGreeting(): GreetingLine {
  // The account's name, or the app's one hard-coded name on a build with no account at all.
  const { name } = useAuth()
  const [opened] = useState(openGreeting)
  const [line, setLine] = useState<{ greeting: Greeting; source: GreetingSource }>({
    greeting: opened.greeting,
    source: "pool",
  })

  useEffect(() => {
    if (!hasGreetingServer()) return
    let live = true
    // The languages this browser has shown lately, so the server draws a different one.
    asked ??= greetingFromServer(opened.avoid)
    void asked.then((answer) => {
      if (answer === null || !live) return
      rememberLanguage(answer.language)
      setLine({ greeting: answer, source: "server" })
    })
    return () => {
      live = false
    }
  }, [opened])

  return { ...line.greeting, name: name ?? OWNER_NAME, source: line.source }
}
