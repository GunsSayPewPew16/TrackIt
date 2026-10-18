/**
 * Who is signed in, and what that means for the ledger.
 *
 * The provider owns three things the rest of the app must not guess at: the **session** (kept
 * in this browser by `@supabase/supabase-js`, read from storage before any network call, so an
 * installed app with no signal still knows who it is), the **hand-off to the cloud store**
 * (`lib/cloud.ts`), and the **portal's two steps** — the password, then the six digits
 * Supabase mails.
 *
 * **A build with no Supabase values is still a whole app.** `mode` is `"device"`: `ready` is true
 * from the first frame, `user` is null, and nothing here gates a screen — the tracker works on
 * this device exactly as it always has. That is also what keeps a fresh clone, a preview and the
 * flows check working with no setup.
 *
 * **The code is the session.** There is no "signed in but not verified" state to fall into,
 * because the password's session is thrown away before the code is even sent: Supabase signs a
 * password in by handing back a token, so the only way a second step means anything is if that
 * token never reaches the app. `signIn` therefore signs *out* of the session it just made,
 * `verifyCode` establishes the one that counts, and `lib/portal.ts` records on this device that
 * the account finished the step — `App` will drop any session that did not, which covers the
 * tab that is closed at the code screen.
 *
 * **Offline is not an error state.** A cached session boots the app normally; the pull from
 * Postgres is best-effort (`hydrate` leaves the cache alone when it fails) and the queue keeps
 * every write until the network comes back. The only thing that needs a connection is signing
 * in, and the screen says so in words rather than a spinner.
 */

import type { Session, User } from "@supabase/supabase-js"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { attach, claimDeviceLedger, detach, flush } from "@/lib/cloud"
import { forgetVerified, isVerified, markVerified, SIGNUPS_OPEN } from "@/lib/portal"
import { displayName, nameFromAccount } from "@/lib/profile"
import { hasCloud, loadSupabase } from "@/lib/supabase"

/** Where the ledger lives for this build: the account, or this device. */
export type AuthMode = "cloud" | "device"

/** Which of the portal's two steps is on screen. */
export type AuthStage = "password" | "code"

export type AuthContextValue = {
  mode: AuthMode
  /** False until the first session read has finished — only ever false in cloud builds. */
  ready: boolean
  user: User | null
  email: string | null
  /** What the account is called: `profiles.full_name`, then its sign-up metadata, then its address. */
  name: string | null
  /** The portal's step, so the screen can draw the code field without owning the flow. */
  stage: AuthStage
  /** Where the code was sent, while `stage` is `"code"`. */
  challengeEmail: string | null
  /** The last thing that went wrong, in words a person would use. */
  error: string | null
  /** The last thing that went right and needs saying, e.g. "check your inbox". */
  notice: string | null
  /** Check the password and mail the code. `true` means the code step is next. */
  signIn: (email: string, password: string) => Promise<boolean>
  /** Check the six digits, which is what actually signs the account in. */
  verifyCode: (code: string) => Promise<boolean>
  resendCode: () => Promise<boolean>
  /** Give up on the code step: no session, back to the password. */
  cancelChallenge: () => Promise<void>
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
  if (text.includes("token has expired or is invalid") || text.includes("invalid token"))
    return "That code didn't match — check the six digits and try again."
  if (text.includes("email not confirmed"))
    return "This account still has to confirm its email — check your inbox for the link."
  if (text.includes("user already registered")) return "That email already has an account — sign in instead."
  if (text.includes("password should be at least"))
    return "That password is too short — use at least 8 characters."
  if (text.includes("signups not allowed") || text.includes("signup is disabled"))
    return "Sign-ups are closed — this vault is opened by its owner."
  if (text.includes("unable to validate email") || text.includes("invalid email") || text.includes("invalid format"))
    return "That email address doesn't look right."
  if (text.includes("rate limit") || text.includes("too many") || text.includes("only request this"))
    return "Too many attempts — wait a minute and try again."
  if (text.includes("error sending") || text.includes("smtp"))
    return "The email could not be sent just now. Try again in a minute."
  if (text.includes("failed to fetch") || text.includes("network"))
    return "No connection. Your ledger still works on this device; signing in needs a network."
  return message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!hasCloud)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [stage, setStage] = useState<AuthStage>("password")
  const [challengeEmail, setChallengeEmail] = useState<string | null>(null)
  /** The name `profiles.full_name` gave this account, once it has been read. */
  const [profile, setProfile] = useState<{ id: string; name: string | null } | null>(null)

  /**
   * Set from the moment the password is being checked until the code is verified.
   *
   * Every path that would adopt a session looks at it, because the one session this provider
   * must never adopt is the disposable one `signInWithPassword` hands back — and Supabase
   * announces it through `onAuthStateChange` like any other.
   */
  const holding = useRef(false)

  useEffect(() => {
    if (!hasCloud) return
    let alive = true
    let stopWatching: (() => void) | null = null

    // The client is a chunk of its own (`lib/supabase.ts`), so boot is a promise: fetch it, then
    // read the stored session. `ready` is the only thing that waits — a device-only build never
    // enters this branch at all.
    void loadSupabase().then((client) => {
      if (!alive || !client) return
      void client.auth.getSession().then(async ({ data }) => {
        if (!alive) return
        const stored = data.session ?? null
        // A session that never finished the code step is not a session: it is the password
        // half of one, left behind by a tab closed at the code screen.
        if (stored && !isVerified(stored.user.id)) {
          await client.auth.signOut({ scope: "local" })
          if (!alive) return
          setSession(null)
          setReady(true)
          return
        }
        setSession(stored)
        setReady(true)
      })
      const { data } = client.auth.onAuthStateChange((_event, next) => {
        if (!alive || holding.current) return
        if (next && !isVerified(next.user.id)) return
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

  /**
   * The account's name, and — once it is known to be the owner's — the one-time move of this
   * device's ledger into an empty vault (`lib/cloud.ts`).
   *
   * Both live here because both need the same fact and neither should ask for it twice: the
   * greeting draws the name, and the claim compares it to `OWNER_NAME`.
   */
  useEffect(() => {
    if (!userId || !session) return
    let live = true
    void displayName(session.user).then((confirmed) => {
      if (!live) return
      setProfile({ id: userId, name: confirmed })
      void claimDeviceLedger(userId, confirmed)
    })
    return () => {
      live = false
    }
  }, [userId, session])

  /**
   * The name, derived rather than stored: the session's own answer until the account's row
   * arrives, and never the previous account's — the id is part of the comparison, so signing
   * in as somebody else cannot draw the last name for a frame.
   */
  const name = useMemo(() => {
    if (!session) return null
    const fromSession = nameFromAccount(session.user)
    const read = profile?.id === session.user.id ? profile.name : null
    return read ?? fromSession
  }, [session, profile])

  /**
   * Step one: the password, then the code.
   *
   * The password is checked by actually signing in — there is no other endpoint that answers
   * "was that right?" — and the session it makes is **thrown away immediately**, before the
   * code is sent. From then until `verifyCode` succeeds this provider is `holding`, so no
   * screen is behind the portal and no ledger is attached.
   */
  const signIn = useCallback(async (email: string, password: string) => {
    const client = await loadSupabase()
    if (!client) return false
    setError(null)
    setNotice(null)
    holding.current = true

    const { error: failure } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (failure) {
      holding.current = false
      setError(said(failure.message))
      return false
    }
    await client.auth.signOut({ scope: "local" })
    setSession(null)

    const { error: mail } = await client.auth.signInWithOtp({
      email: email.trim(),
      // Nobody is created here: a second factor belongs to an account that already exists.
      options: { shouldCreateUser: false },
    })
    holding.current = false
    if (mail) {
      setError(said(mail.message))
      return false
    }
    setChallengeEmail(email.trim())
    setStage("code")
    return true
  }, [])

  /** Step two: the six digits, which are the only thing that opens the account. */
  const verifyCode = useCallback(
    async (code: string) => {
      const client = await loadSupabase()
      if (!client || !challengeEmail) return false
      setError(null)
      setNotice(null)
      const { data, error: failure } = await client.auth.verifyOtp({
        email: challengeEmail,
        token: code.replace(/\D/g, ""),
        type: "email",
      })
      if (failure) {
        setError(said(failure.message))
        return false
      }
      if (!data.session) {
        setError("That code didn't sign you in. Ask for another one.")
        return false
      }
      // Marked before the session is adopted: `lib/portal.ts` is what `App` trusts, and the
      // order is the difference between an account that opened and one that was locked out.
      markVerified(data.session.user.id)
      holding.current = false
      setSession(data.session)
      setStage("password")
      setChallengeEmail(null)
      return true
    },
    [challengeEmail],
  )

  const resendCode = useCallback(async () => {
    const client = await loadSupabase()
    const email = challengeEmail
    if (!client || !email) return false
    setError(null)
    setNotice(null)
    const { error: mail } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    })
    if (mail) {
      setError(said(mail.message))
      return false
    }
    setNotice(`Another code is on its way to ${email}.`)
    return true
  }, [challengeEmail])

  /** Give the code step up: the password session is already gone, so this only clears the screen. */
  const cancelChallenge = useCallback(async () => {
    const client = await loadSupabase()
    holding.current = false
    setStage("password")
    setChallengeEmail(null)
    setError(null)
    setNotice(null)
    if (client) await client.auth.signOut({ scope: "local" })
    setSession(null)
  }, [])

  /**
   * Create the account, and say what happens next.
   *
   * **Closed unless the build opens it** (`lib/portal.ts`, `VITE_SIGNUP`). The switch in the
   * Supabase dashboard is the real fence; this is the promise that no screen can walk around
   * it, and the sentence the portal shows when somebody tries.
   */
  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    if (!SIGNUPS_OPEN) {
      setNotice(null)
      setError("Sign-ups are closed — this vault is opened by its owner.")
      return false
    }
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
    // that follows it. A failure is fine — the queue keeps it for the next sign-in, which is
    // what the account sheet says in words.
    await flush().catch(() => undefined)
    await client.auth.signOut()
    forgetVerified()
    setStage("password")
    setChallengeEmail(null)
    setSession(null)
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
      name,
      stage,
      challengeEmail,
      error,
      notice,
      signIn,
      verifyCode,
      resendCode,
      cancelChallenge,
      signUp,
      resetPassword,
      signOut,
      dismiss,
    }),
    [
      ready,
      session,
      name,
      stage,
      challengeEmail,
      error,
      notice,
      signIn,
      verifyCode,
      resendCode,
      cancelChallenge,
      signUp,
      resetPassword,
      signOut,
      dismiss,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** The session, the hand-off, and the verbs that change them. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used inside an AuthProvider.")
  return context
}
