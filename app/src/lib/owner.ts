/**
 * Whose name the greeting says.
 *
 * The artboard greets a "Alex", and on a build with an account the name is the account's own:
 * `profiles.full_name`, then the session's metadata, then the address's local part (`lib/profile.ts`).
 * This file is what answers on a build with **no account** — the device-only tracker — where there
 * is nobody to ask, and it answers twice over:
 *
 * - `OWNER_NAME` is the name such a build starts with, which is why it is here on its own: it is
 *   the one string in the app that is neither data nor design.
 * - The store below is what the owner makes of it. `SettingsScreen`'s name field writes it, and the
 *   greeting reads it back (`hooks/useAuth.tsx` hands it to `useGreeting`), so a device-only build
 *   is not stuck greeting the person it was written for.
 *
 * Only the name: the word in front of it is a different language every time the app is
 * opened, so the greetings live together in `lib/greetings.ts`, and `hooks/useGreeting.ts` is what
 * puts the two halves on one line.
 *
 * The store's shape is the app's usual one for a preference that outlives React — one key, one
 * cached snapshot so `useSyncExternalStore` can compare by identity, listeners, and best-effort
 * storage (`lib/balances.ts` is the same pattern with numbers in it). On a build **with** an account
 * this store is never written: the name belongs to the account there, and it follows it to every
 * device. A browser that refuses storage simply keeps the name for the session.
 */

export const OWNER_NAME = "Priyansh"

const NAME_KEY = "trackit-name"

/** `undefined` until the first read: a stored name, or `null` for a browser that has never set one. */
let cache: string | null | undefined
const listeners = new Set<() => void>()

function read(): string | null {
  try {
    const raw = window.localStorage.getItem(NAME_KEY)
    if (raw === null) return null
    const trimmed = raw.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch {
    // A private window cannot remember anything, which is not worth failing a render over.
    return null
  }
}

/** The name this device was given, or `null` when the owner has never set one. */
export function ownerNameSnapshot(): string | null {
  cache ??= read()
  return cache
}

export function subscribeOwnerName(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Set it. An empty name is refused rather than stored: a greeting with nothing after the comma is
 * worse than the name it had, and clearing the field is not a way to say "unnamed".
 */
export function setOwnerName(next: string): void {
  const trimmed = next.trim()
  if (trimmed.length === 0) return
  cache = trimmed
  try {
    window.localStorage.setItem(NAME_KEY, trimmed)
  } catch {
    // No memory, but this session is renamed either way.
  }
  for (const listener of listeners) listener()
}
