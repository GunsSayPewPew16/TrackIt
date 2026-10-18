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
 * **The name is editable, and it belongs to the account.** `rename` writes `profiles.full_name`,
 * updates the cache this tab reads names through (`lib/profile.ts`), and tells the session's own
 * metadata as well — best effort, because the session's copy is what answers with no network. On a
 * build with no account there is nobody to ask, so the name is this browser's own
 * (`lib/owner.ts`), and the same call writes that instead.
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
 *
 * **Two ways out, and neither waits for the network.** `signOut` clears this device's session
 * *before* it asks the server to revoke anything, and it caps the flush it does first at a few
 * seconds: a request that hangs must cost the owner their pending writes' *timing*, never the
 * button. The queue is on disk and per account (`trackit-cloud-queue:<id>`), so the next
 * sign-in drains it.
 *
 * **A session that arrives in the URL is a mailbox proof.** The mailed code is the app's own
 * second step, but Supabase's stock Magic Link mail carries a link instead of digits — and a
 * link the owner actually clicked is the same proof of the same mailbox. `emailRedirectTo`
 * points that link back at this app, and a session found in the URL hash is marked verified on
 * boot, so the door opens either way. Nothing else about the portal changes.
 *
 * **The link can also be pasted in, which is the only way through inside an installed iOS web
 * app.** That app is its own container — no storage shared with Safari — and a link tapped in
 * Mail opens in Safari, so the session it carries can never arrive on its own there. `verifyLink`
 * reads the pasted link with `lib/mail-link.ts` and spends it through `verifyOtp({ token_hash })`,
 * the same request the link itself makes. Same proof, same single use, no template required.
 *
 * **A session from an older release is not a session.** `SESSION_EPOCH` in `lib/portal.ts` is
 * checked on boot: when the number moves, the stored session is dropped once — with the verified
 * mark — and this device records that it is on the new epoch. That is what signs everybody out
 * after a release instead of leaving one stale login alive on somebody's phone.
 */

import type { Session, User } from "@supabase/supabase-js"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import { attach, claimDeviceLedger, detach, flush } from "@/lib/cloud"
import {
  epochSettled,
  forgetVerified,
  isVerified,
  markVerified,
  settleEpoch,
  SIGNUPS_OPEN,
} from "@/lib/portal"
import { ticketFrom } from "@/lib/mail-link"
import { ownerNameSnapshot, setOwnerName, subscribeOwnerName } from "@/lib/owner"
import { displayName, nameFromAccount, rememberName } from "@/lib/profile"
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
  /**
   * What the account is called: `profiles.full_name`, then its sign-up metadata, then its address
   * — or, on a build with no account, the name this device was given in Settings.
   */
  name: string | null
  /**
   * Set that name. `true` when it was written; `false` when there is nowhere to write it — a blank
   * name, or a cloud build with no session.
   */
  rename: (name: string) => Promise<boolean>
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
  /**
   * The other half of the same proof: a link from that mail, pasted in rather than opened.
   *
   * The only way in on a project whose mail carries a link and no digits — and the *only* way
   * in at all inside an installed iOS web app, which cannot be handed a session by a link.
   */
  verifyLink: (text: string) => Promise<boolean>
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
 * The app's own address, which is where a mailed link comes back to.
 *
 * It is `BASE_URL` resolved on this origin rather than `location.href`, so a build served from a
 * sub-path (GitHub Pages' `/TrackIt/`) lands inside the app and a link carrying a hash cannot
 * fold a previous session's tokens into the next one. Read once at module load: the origin and
 * the base never change for a page, and a value that did would change the meaning of every
 * callback below.
 */
const PORTAL_REDIRECT =
  typeof window === "undefined"
    ? undefined
    : new URL(import.meta.env.BASE_URL, window.location.origin).href

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

  /**
   * Whether this page load was opened by the mailed link rather than typed into.
   *
   * Read **once, at mount, before the client exists**: `detectSessionInUrl` consumes the hash as
   * soon as the client is created for a cloud build, so by the time the session is read there is
   * nothing left in the URL to look at.
   */
  const arrivedByLink = useRef(
    typeof window !== "undefined" && /(^|[#&])access_token=/.test(window.location.hash),
  )

  useEffect(() => {
    if (!hasCloud) return
    let alive = true
    let stopWatching: (() => void) | null = null

    // The client is a chunk of its own (`lib/supabase.ts`), so boot is a promise: fetch it, then
    // read the stored session. `ready` is the only thing that waits — a device-only build never
    // enters this branch at all.
    void loadSupabase().then((client) => {
      if (!alive || !client) return

      /** A session the URL brought: the link was clicked, so the mailbox is already proven. */
      const adoptLinkSession = (userId: string) => {
        if (!arrivedByLink.current) return false
        markVerified(userId)
        arrivedByLink.current = false
        // The tokens have been read; leaving them in the address bar puts a session in a
        // screenshot and in the browser's history.
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
        return true
      }

      // The release pass: a session from an older epoch is retired here, before any screen is
      // drawn, and this device is marked as being on the current one either way.
      const retireOldEpoch = async () => {
        if (epochSettled()) return false
        settleEpoch()
        forgetVerified()
        // Not awaited on its own: `local` sign-out still asks the server, and a request that
        // hangs must not keep the vault open. The stored session is removed by the library
        // when it can, and by the `isVerified` gate below when it cannot.
        void Promise.race([
          client.auth.signOut({ scope: "local" }).catch(() => undefined),
          new Promise((resolve) => window.setTimeout(resolve, 2000)),
        ])
        return true
      }

      void retireOldEpoch().then(async (retired) => {
        if (!alive) return
        if (retired) {
          setSession(null)
          setReady(true)
          return
        }
        const { data } = await client.auth.getSession()
        if (!alive) return
        const stored = data.session ?? null
        // A session that arrived in the URL was opened by the mailed link.
        if (stored) adoptLinkSession(stored.user.id)
        // A session that never finished the code step is not a session: it is the password
        // half of one, left behind by a tab closed at the code screen.
        if (stored && !isVerified(stored.user.id)) {
          void client.auth.signOut({ scope: "local" }).catch(() => undefined)
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
        if (next && !isVerified(next.user.id) && !adoptLinkSession(next.user.id)) return
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
   * What this browser is called on a build with no account, which is the only thing Settings can
   * write there (`lib/owner.ts`). Subscribed rather than read once, so the greeting changes as the
   * field is saved instead of on the next load.
   */
  const deviceName = useSyncExternalStore(subscribeOwnerName, ownerNameSnapshot, ownerNameSnapshot)

  /**
   * The name, derived rather than stored: the session's own answer until the account's row
   * arrives, and never the previous account's — the id is part of the comparison, so signing
   * in as somebody else cannot draw the last name for a frame. Signed out — or built with no
   * account at all — the device's own name stands in.
   */
  const name = useMemo(() => {
    if (!session) return deviceName
    const fromSession = nameFromAccount(session.user)
    const read = profile?.id === session.user.id ? profile.name : null
    return read ?? fromSession ?? deviceName
  }, [session, profile, deviceName])

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
      options: {
        // Nobody is created here: a second factor belongs to an account that already exists.
        shouldCreateUser: false,
        // Where a mailed link lands. The code is the app's own step, but a stock Supabase
        // template mails a link, and a link that points at localhost is a dead end — so it
        // points here instead, and `detectSessionInUrl` adopts it if it is opened.
        emailRedirectTo: PORTAL_REDIRECT,
      },
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

  /**
   * The end of both second steps: this session counts, and the portal is done with.
   *
   * Marked before the session is adopted: `lib/portal.ts` is what `App` trusts, and the order is
   * the difference between an account that opened and one that was locked out.
   */
  const openVault = useCallback((session: Session) => {
    markVerified(session.user.id)
    holding.current = false
    setSession(session)
    setStage("password")
    setChallengeEmail(null)
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
      openVault(data.session)
      return true
    },
    [challengeEmail, openVault],
  )

  /**
   * Step two, the other half: the link from that mail, pasted in.
   *
   * A mailbox proof is the mail being received, and a link that was received proves exactly what
   * six digits prove — so this is not a way around the second step, it is the same step in the
   * one shape that fits **inside an installed iOS web app**: that app has its own storage and a
   * link tapped in Mail opens in Safari, so the session a link carries can never arrive on its
   * own. Pasting the link is the owner carrying it in by hand, and `verifyOtp({ token_hash })` is
   * the request the link would have made.
   *
   * The refusal is worded for a link rather than a code: single use is the thing that goes wrong
   * with these (the mail may also have been fetched by tapping it, which spends it).
   */
  const verifyLink = useCallback(
    async (text: string) => {
      const client = await loadSupabase()
      if (!client) return false
      setError(null)
      setNotice(null)
      const ticket = ticketFrom(text)
      if (!ticket) {
        setError("That doesn't read as the link from the mail — copy the whole link and paste it here.")
        return false
      }
      const { data, error: failure } = await client.auth.verifyOtp({
        token_hash: ticket.tokenHash,
        type: ticket.type,
      })
      if (failure) {
        const refused = failure.message.toLowerCase()
        setError(
          refused.includes("expired") || refused.includes("invalid")
            ? "That link has already been used or has expired — send another one."
            : said(failure.message),
        )
        return false
      }
      if (!data.session) {
        setError("That link didn't sign you in. Send another one.")
        return false
      }
      openVault(data.session)
      return true
    },
    [openVault],
  )

  const resendCode = useCallback(async () => {
    const client = await loadSupabase()
    const email = challengeEmail
    if (!client || !email) return false
    setError(null)
    setNotice(null)
    const { error: mail } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: PORTAL_REDIRECT },
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

    // Pending writes get a few seconds to go up, and no more: they stay on disk either way
    // (`trackit-cloud-queue:<id>`, drained on the next sign-in). Waiting on them is what used
    // to make this button look dead on a slow connection.
    const sent = flush().catch(() => undefined)
    await Promise.race([
      sent,
      new Promise((resolve) => window.setTimeout(resolve, 2500)),
    ])

    // The screen leaves the account now, whatever the network is doing. Clearing the verified
    // mark is what makes a session that outlives this call (a failed local removal) fail the
    // gate on the next boot instead of opening the vault again.
    forgetVerified()
    setError(null)
    setNotice(null)
    setStage("password")
    setChallengeEmail(null)
    setSession(null)

    // The stored session goes now, not when a request finishes: the library's own sign-out asks
    // the server *before* it removes anything, and a token that is still in `localStorage` is a
    // token the next page load can find. The key is this app's own (`lib/supabase.ts`).
    try {
      window.localStorage.removeItem("trackit-auth")
    } catch {
      // A browser that refuses storage has no session to keep anyway.
    }

    // …and the token is revoked behind it, best effort. `local` is the scope that matters on
    // this device; other devices keep their own sessions.
    if (client) void client.auth.signOut({ scope: "local" }).catch(() => undefined)
  }, [])

  /**
   * Rename the account — or, with no account to name, this browser.
   *
   * Three writes happen in the account case and only the first one decides the answer, because
   * they fail differently: the row is the fact (and is what every other device reads), the tab's
   * cache is what keeps this session honest without a second query, and the session's metadata is a
   * copy that only matters when the network is gone. A name that reaches the row and not the
   * metadata is a name that is right everywhere and briefly stale offline; a name that reached
   * neither is a rename that did not happen, which is why `false` is returned and the screen says so.
   */
  const rename = useCallback(
    async (next: string) => {
      const trimmed = next.trim()
      if (trimmed.length === 0) return false

      // A build with no account has nobody to tell: the name is this device's own.
      if (!hasCloud || !session) {
        setOwnerName(trimmed)
        return true
      }

      const client = await loadSupabase()
      if (!client) return false
      const userId = session.user.id
      const { error: failure } = await client
        .from("profiles")
        .upsert({ id: userId, full_name: trimmed }, { onConflict: "id" })
      if (failure) return false

      rememberName(userId, trimmed)
      setProfile({ id: userId, name: trimmed })
      void client.auth.updateUser({ data: { full_name: trimmed } }).catch(() => undefined)
      return true
    },
    [session],
  )

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
      rename,
      stage,
      challengeEmail,
      error,
      notice,
      signIn,
      verifyCode,
      verifyLink,
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
      rename,
      stage,
      challengeEmail,
      error,
      notice,
      signIn,
      verifyCode,
      verifyLink,
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
