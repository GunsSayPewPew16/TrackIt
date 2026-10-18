/**
 * The portal's two facts: who may create an account, and whether the session on this
 * device ever finished the code step.
 *
 * **Sign-ups are closed by default.** This vault holds two accounts, and both were made
 * by its owner, so the portal has no *Create account* path at all. `VITE_SIGNUP=on` puts
 * one back for a build that wants it (a staging project, a fresh install), and the real
 * fence is Supabase's own **Allow new users to sign up** switch — a client can hide a
 * button, only the project can refuse a row in `auth.users`. `hooks/useAuth.tsx` refuses
 * `signUp` in code as well, so no future screen can walk around this screen's decision.
 *
 * **The marker is what makes the second step mean something.** Supabase signs a password
 * in by handing back a session, and there is no second-factor concept in its email flow
 * that a client can lean on: the code here is a code the app sends and the app checks. So
 * the rule this file records is the app's own — a session counts when the account it
 * belongs to passed the code step on this device — and `useAuth` **drops any session that
 * did not**. Without that, pressing *Sign in* and closing the tab at the code screen would
 * still have signed the account in, which is the one thing a second step exists to stop.
 *
 * A browser that refuses storage is let through rather than locked out: a session there
 * cannot persist across a reload anyway, so the marker would be gone by the time it
 * mattered, and refusing would break the portal for a private window instead of securing
 * anything.
 */

/** Whether the portal offers a way to create an account. Closed unless the build says so. */
export const SIGNUPS_OPEN = import.meta.env.VITE_SIGNUP?.trim() === "on"

/**
 * The session epoch.
 *
 * **Bumping this number signs every device out once.** A session that was adopted under an
 * older epoch is not trusted: `hooks/useAuth.tsx` drops it on the next boot, before any screen
 * is drawn, and records that this device is on the new epoch. After that one pass the rule is
 * the ordinary one — a session lasts until the owner signs out.
 *
 * It exists because a release can change what a session *means* (a different project, a fixed
 * portal, a sign-in flow that used to leave something behind). Deleting a stale session is the
 * only honest way to ship that: leaving it in place would keep the old state alive on the one
 * device that matters, and asking the owner to sign out is exactly the button that was not
 * working. The number is a plain string so the pass is a comparison and nothing else.
 */
export const SESSION_EPOCH = "2"

const VERIFIED_KEY = "trackit-portal:verified"
const EPOCH_KEY = "trackit-portal:epoch"

/** Whether this device has already been through the current epoch's one-time sign-out. */
export function epochSettled(): boolean {
  try {
    return window.localStorage.getItem(EPOCH_KEY) === SESSION_EPOCH
  } catch {
    // A private window cannot keep a session either, so there is nothing to retire.
    return true
  }
}

/** Record that this device is on the current epoch, so the next boot trusts its session. */
export function settleEpoch(): void {
  try {
    window.localStorage.setItem(EPOCH_KEY, SESSION_EPOCH)
  } catch {
    /* Nothing to record; the next boot repeats the pass, which costs a sign-in. */
  }
}

/** Record that this device signed `userId` in through both steps. */
export function markVerified(userId: string): void {
  try {
    window.localStorage.setItem(VERIFIED_KEY, userId)
  } catch {
    // A private window: the session cannot outlive the tab either, so there is nothing
    // to record and nothing to lose.
  }
}

/** Whether this device's session for `userId` has been through the code step. */
export function isVerified(userId: string): boolean {
  try {
    const marked = window.localStorage.getItem(VERIFIED_KEY)
    if (marked === null) return false
    return marked === userId
  } catch {
    return true
  }
}

/** Forget it. Signing out is the only thing that does. */
export function forgetVerified(): void {
  try {
    window.localStorage.removeItem(VERIFIED_KEY)
  } catch {
    /* Nothing to forget. */
  }
}
