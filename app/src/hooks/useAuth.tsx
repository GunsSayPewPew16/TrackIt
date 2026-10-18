/**
 * Who is signed in, and what that means for the ledger.
 *
 * The provider owns two things the rest of the app must not guess at: the **session** (kept in
 * this browser by `@supabase/supabase-js`, read from storage before any network call, so an
 * installed app with no signal still knows who it is) and the **hand-off to the cloud store**
 * (`lib/cloud.ts`), which is attached when a user appears and detached when one leaves.
 *
 * **A build with no Supabase values is still a whole app.** `mode` is `"device"`: `ready` is true
 * from the first frame, `user` is null, and nothing here gates a screen — the tracker works on
 * this device exactly as it always has. That is also what keeps a fresh clone, a preview and the
 * flows check working with no setup.
 *
 * **Offline is not an error state.** A cached session boots the app normally; the pull from
 * Postgres is best-effort (`hydrate` leaves the cache alone when it fails) and the queue keeps
 * every write until the network comes back. The only thing that needs a connection is signing
 * in, and the screen says so in words rather than a spinner.
 */

import type { Session, User } from "@supabase/supabase-js"
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import { attach, detach, flush } from "@/lib/cloud"
import { hasCloud, loadSupabase } from "@/lib/supabase"

/** Where the ledger lives for this build: the account, or this device. */
export type AuthMode = "cloud" | "device"

export type AuthContextValue = {
  mode: AuthMode
  /** False until the first session read has finished — only ever false in cloud builds. */
  ready: boolean
  user: User | null
  email: string | null
  /** The last thing that went wrong, in words a person would use. */
  error: string | null
  /** The last thing that went right and needs saying, e.g. "check your inbox". */
  notice: string | null
  signIn: (email: string, password: string) => Promise<boolean>
  signUp: (email: string, password: string, fullName?: string) => Promise<boolean>
  resetPassword: (email: string) => Promise<boolean>
  signOut: () => Promise<void>
  dismiss: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/**
 * Supabase's errors, said the way the screen would say them.
 *
 * The library's own strings are written for a developer reading a console ("Invalid login
 * credentials", "Email not confirmed"), and a login screen is the one place the owner meets them
 * with no code in sight. Anything unrecognised is passed through rather than swallowed: a
 * message nobody anticipated is more useful than "Something went wrong".
 */
function said(message: string): string {
  const text = message.toLowerCase()
  if (text.includes("invalid login credentials")) return "That email and password don't match."
  if (text.includes("email not confirmed"))
    return "This account still has to confirm its email — check your inbox for the link."
  if (text.includes("user already registered")) return "That email already has an account — sign in instead."
  if (text.includes("password should be at least"))
    return "That password is too short — use at least 8 characters."
  if (text.includes("unable to validate email") || text.includes("invalid email"))
    return "That email address doesn't look right."
  if (text.includes("rate limit") || text.includes("too many"))
    return "Too many attempts — wait a minute and try again."
  if (text.includes("failed to fetch") || text.includes("network"))
    return "No connection. Your ledger still works on this device; signing in needs a network."
  return message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!hasCloud)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!hasCloud) return
    let alive = true
    let stopWatching: (() => void) | null = null

    // The client is a chunk of its own (`lib/supabase.ts`), so boot is a promise: fetch it, then
    // read the stored session. `ready` is the only thing that waits — a device-only build never
    // enters this branch at all.
    void loadSupabase().then((client) => {
      if (!alive || !client) return
      void client.auth.getSession().then(({ data }) => {
        if (!alive) return
        setSession(data.session ?? null)
        setReady(true)
      })
      const { data } = client.auth.onAuthStateChange((_event, next) => {
        if (!alive) return
        setSession(next)
        setReady(true)
        // A refresh that could not reach the server leaves the session in place: the ledger is
        // still readable from the cache, and the queue keeps the writes until it can.
      })
      stopWatching = () => data.subscription.unsubscribe()
    })

    return () => {
      alive = false
      stopWatching?.()
    }
  }, [])

  const userId = session?.user.id ?? null

  /**
   * The hand-off, once per identity change.
   *
   * `attach` points the local store at this account's own cache and starts the pull; `detach`
   * hands the device its own ledger back. Neither deletes anything: signing out is not an
   * erasure, and the account's cache is waiting at its own key next time.
   */
  useEffect(() => {
    if (!hasCloud) return
    if (userId) attach(userId)
    else detach()
  }, [userId])

  const signIn = useCallback(async (email: string, password: string) => {
    const client = await loadSupabase()
    if (!client) return false
    setError(null)
    setNotice(null)
    const { error: failure } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (failure) {
      setError(said(failure.message))
      return false
    }
    return true
  }, [])

  /**
   * Create the account, and say what happens next.
   *
   * With email confirmation on (Supabase's default), a successful sign-up hands back a user but
   * **no session** — so the screen must not pretend the owner is in. The notice is the difference
   * between "the button did nothing" and "check your inbox".
   */
  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    const client = await loadSupabase()
    if (!client) return false
    setError(null)
    setNotice(null)
    const { data, error: failure } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: { data: fullName ? { full_name: fullName } : undefined },
    })
    if (failure) {
      setError(said(failure.message))
      return false
    }
    if (!data.session) {
      setNotice("Account made. Check your inbox for the confirmation link, then sign in.")
      return false
    }
    return true
  }, [])

  /**
   * The way back in for a forgotten password.
   *
   * Supabase mails a link; the app has no page to land on, so the link's own screen (the
   * project's hosted one) is where the new password is typed. Saying that plainly is better
   * than a button that looks like it signed somebody in.
   */
  const resetPassword = useCallback(async (email: string) => {
    const client = await loadSupabase()
    if (!client) return false
    setError(null)
    setNotice(null)
    const { error: failure } = await client.auth.resetPasswordForEmail(email.trim())
    if (failure) {
      setError(said(failure.message))
      return false
    }
    setNotice(`A reset link is on its way to ${email.trim()} — open it to set a new password.`)
    return true
  }, [])

  const signOut = useCallback(async () => {
    const client = await loadSupabase()
    if (!client) return
    setError(null)
    setNotice(null)
    // Pending writes go out first: a row typed a moment ago should not be lost to the sign-out
    // that follows it. A failure is fine — the queue keeps it for the next sign-in.
    await flush().catch(() => undefined)
    await client.auth.signOut()
  }, [])

  const dismiss = useCallback(() => {
    setError(null)
    setNotice(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      mode: hasCloud ? "cloud" : "device",
      ready,
      user: session?.user ?? null,
      email: session?.user.email ?? null,
      error,
      notice,
      signIn,
      signUp,
      resetPassword,
      signOut,
      dismiss,
    }),
    [ready, session, error, notice, signIn, signUp, resetPassword, signOut, dismiss],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** The session, the hand-off, and the two verbs that change them. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used inside an AuthProvider.")
  return context
}
