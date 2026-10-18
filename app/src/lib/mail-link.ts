/**
 * The mailed link, read as the ticket it carries.
 *
 * The portal's second step is six digits, and the digits are Supabase's own `{{ .Token }}` —
 * which a project can only put in its mail if it can edit the Magic Link template, and a
 * free-tier project on the built-in mailer cannot (`supabase/README.md` §2). What every project
 * *does* mail is the link. On a desk that link is enough on its own: it comes back to this app's
 * address and `detectSessionInUrl` adopts the session it carries.
 *
 * Inside an **installed iOS web app** it never gets that chance. That app is its own container
 * (no shared cookies or storage with Safari), and a link tapped in Mail opens in Safari — so the
 * session lands somewhere the installed app cannot see, which is the one place this door had no
 * way through at all.
 *
 * So the link is also read as what it is: a ticket. `ticketFrom` pulls the hash and its type out
 * of whatever the owner pasted — the whole link, a line-wrapped one, or the bare hash — and
 * `hooks/useAuth.tsx` hands it to `verifyOtp({ token_hash })`, which is the request the link
 * itself would have made. The proof is unchanged (the mail was received and is single-use), and
 * it now works in the one container a link cannot reach.
 *
 * **Whitespace is removed rather than just trimmed.** Mail clients wrap long links, and a copy
 * that carries a newline in the middle of the hash is the ordinary case — the mailbox is the
 * proof, so being forgiving about how it arrived costs nothing. Surrounding quotes and angle
 * brackets go the same way.
 */

/** What `verifyOtp` needs: the hash the mail carries, and what kind of proof it is. */
export type MailTicket = {
  tokenHash: string
  type: "magiclink" | "email" | "signup" | "recovery"
}

/** The types this app will hand to Supabase. A `type` it does not know is not guessed at. */
const KNOWN: ReadonlyArray<MailTicket["type"]> = ["magiclink", "email", "signup", "recovery"]

/** Supabase's hashes are hex. A bare paste has to look like one to be treated as a hash. */
const LOOKS_LIKE_HASH = /^[0-9a-f]{20,}$/i

/** The ticket in `text`, or null when there is nothing here to verify. */
export function ticketFrom(text: string): MailTicket | null {
  const squashed = text
    .replace(/\s+/g, "")
    .replace(/^[<"']+/, "")
    .replace(/[>"'.,);]+$/, "")
  if (squashed.length === 0) return null

  // Everything after the first `?` is the query; a `#` ends it, because this app's own callback
  // puts a session hash behind the redirect. A link with no query is read as a bare hash instead.
  const afterQuestion = squashed.includes("?") ? squashed.slice(squashed.indexOf("?") + 1) : ""
  const params = new URLSearchParams(afterQuestion.split("#")[0])
  const hash = params.get("token") ?? params.get("token_hash") ?? (LOOKS_LIKE_HASH.test(squashed) ? squashed : null)
  if (!hash || !LOOKS_LIKE_HASH.test(hash)) return null

  const declared = params.get("type")
  const type = KNOWN.find((candidate) => candidate === declared) ?? "magiclink"
  return { tokenHash: hash, type }
}
