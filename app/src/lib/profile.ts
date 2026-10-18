/**
 * What the app calls the person signed in.
 *
 * The greeting has always said `OWNER_NAME` (`lib/owner.ts`) because a Wallet export
 * carries no account holder's name. With two accounts in one vault that is no longer
 * true: the name belongs to the account, not to the app, so it is read from
 * `profiles.full_name` — the column the schema gave every account, filled by the
 * `auth.users` trigger from whatever the account was created with.
 *
 * Three sources, in the order they are trusted:
 *
 * 1. **`profiles.full_name`** — the account's own row, which the owner can change without
 *    a redeploy. It is one row on the same client the ledger already uses, so it costs
 *    nothing extra on a sign-in; it is cached per account for the life of the tab.
 * 2. **The sign-up metadata** (`user_metadata.full_name`) — read from the session, so it
 *    works with no network at all. The trigger copies it into `profiles`, so this only
 *    answers before the row is read, or when the table cannot be reached.
 * 3. **The email's own local part** — `dhootnimisha4@gmail.com` becomes *Dhootnimisha*.
 *    Not pretty, but never wrong about *who*, and better than greeting a guest with
 *    somebody else's name.
 *
 * `OWNER_NAME` stays as the last resort for a **device-only** build, which has no account
 * and no other source at all.
 */

import { getSupabase } from "./supabase"

/** The parts of a Supabase user this file needs, so callers need not import the type. */
export type Account = {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}

/** One read per account per tab: the name cannot change while the session is open. */
const names = new Map<string, string | null>()

const clean = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null

/**
 * The email's local part, tidied into something a greeting can say.
 *
 * Digits are dropped and the first letter is capitalised, because an address is an
 * address: `dhootnimisha4` is not a name, but it is the closest thing to one this
 * account has told the app.
 */
function fromEmail(email: string | null | undefined): string | null {
  const local = (email ?? "").split("@")[0].replace(/[^a-z]/gi, "").replace(/\d+$/, "")
  if (local.length === 0) return null
  return local[0].toUpperCase() + local.slice(1)
}

/** The name the session itself carries. No network, so it answers while offline. */
export function nameFromAccount(account: Account | null | undefined): string | null {
  if (!account) return null
  return clean(account.user_metadata?.full_name) ?? fromEmail(account.email)
}

/**
 * The account's own row, or `null` if it cannot be read.
 *
 * Best effort in both directions: a device with no signal, or a project where the row
 * has not been made yet, falls through to the session's own name rather than showing
 * nothing.
 */
export async function loadProfileName(userId: string): Promise<string | null> {
  if (names.has(userId)) return names.get(userId) ?? null
  const client = getSupabase()
  if (!client) return null
  const { data, error } = await client
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle()
  if (error) return null
  const name = clean((data as { full_name?: unknown } | null)?.full_name)
  names.set(userId, name)
  return name
}

/** The name to draw: the account's row, then its session, then its address. */
export async function displayName(account: Account): Promise<string | null> {
  return (await loadProfileName(account.id)) ?? nameFromAccount(account)
}
