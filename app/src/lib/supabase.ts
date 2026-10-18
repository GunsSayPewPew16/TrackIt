/**
 * The Supabase client, loaded only when there is a project to talk to.
 *
 * The app is a static site, so there is no server of its own to hold a secret: the two values
 * here are the **public** ones (the project URL and the publishable/anon key), they ship inside
 * the bundle, and the only thing standing between one account's money and another's is the
 * row-level security in `supabase/schema.sql`. The service-role key must never be here.
 *
 * **Why this is a loader and not a `createClient` at the top of the module.** `@supabase/supabase-js`
 * is ~230 kB of minified JavaScript, and this app's entry chunk is the one thing the owner waits
 * for before the first pixel (`App.tsx` argues the same point about the three screens). A static
 * import would put all of it in front of a device-only build that never calls it. As a dynamic
 * import it is a chunk of its own, fetched once, only by a build with both values — and the gate
 * already has a frame to spare: it is waiting for the stored session anyway.
 *
 * **A build with no values is a complete app.** `hasCloud` is false, `loadSupabase()` resolves to
 * `null`, no chunk is fetched, and every screen behaves exactly as it did before this module
 * existed — which is what keeps the device-only build, the flows check and a fresh clone working
 * with no setup at all. `VITE_CLOUD=off` forces that mode even when the values are present, so a
 * machine with an `.env.local` can still run the signed-out checks.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ""
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ""
const forcedOff = import.meta.env.VITE_CLOUD?.trim() === "off"

/** Whether this build can talk to a project at all. Known before anything is fetched. */
export const hasCloud = !forcedOff && url.length > 0 && key.length > 0

let client: SupabaseClient | null = null
let loading: Promise<SupabaseClient | null> | null = null

/**
 * The client, fetched on first use and shared after that.
 *
 * `storageKey` is deliberately its own (`trackit-auth`, not the library's default) so the session
 * cannot be confused with the app's ledger keys, and `persistSession` is what lets an installed
 * app open on a phone with no signal and still know who is signed in (the session is read from
 * `localStorage` before any network call). `detectSessionInUrl` is **on** for one reason: the
 * mailed code is the portal's own step, but Supabase's stock Magic Link template mails a link,
 * and `emailRedirectTo` sends that link back here — so a session can arrive in the URL hash and
 * has to be adopted rather than ignored. `hooks/useAuth.tsx` marks such a session verified (a
 * clicked link proves the same mailbox the digits do) and then clears the hash.
 */
export function loadSupabase(): Promise<SupabaseClient | null> {
  if (!hasCloud) return Promise.resolve(null)
  if (loading) return loading
  loading = import("@supabase/supabase-js").then(({ createClient }) => {
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "trackit-auth",
      },
    })
    return client
  })
  return loading
}

/**
 * The client if it is already in hand.
 *
 * Every caller of this runs after the provider's boot (`useAuth` resolves `loadSupabase()` before
 * it reports `ready`), so in practice this is never null in a cloud build — the nullable return is
 * for the device build and for a caller that somehow got ahead of the gate, both of which should
 * do nothing rather than throw.
 */
export function getSupabase(): SupabaseClient | null {
  return client
}
