#!/usr/bin/env node
/**
 * The project's auth settings, applied from the terminal.
 *
 * The portal needs three things from the Supabase project that no bundle can carry: the
 * **Magic Link template must contain `{{ .Token }}`** (otherwise the mail has a link and no
 * digits, and the code step has nothing to read), the **Site URL** must be an address a phone
 * can open, and **both live origins must be on the redirect allow-list** (otherwise Supabase
 * rewrites every mailed link to the Site URL — which is how one ends up pointing at
 * `localhost:3000`).
 *
 * Those live in the dashboard, and clicking them by hand is the step that gets forgotten. This
 * script is the same three edits through the **Management API**, so the whole thing is one
 * command. It is idempotent: it reads the config, patches only what differs, reads it back, and
 * says what it found.
 *
 * ## Running it
 *
 * ```bash
 * SUPABASE_ACCESS_TOKEN=sbp_xxxx npm run setup:auth
 * ```
 *
 * A token comes from **Account → Access Tokens** (`https://supabase.com/dashboard/account/tokens`)
 * and is not the project's publishable key — it is an account credential, so it belongs in the
 * shell for one command, never in this repository. The project ref is read from
 * `app/src/lib/supabase-config.ts`, which is also where the app's public URL lives; pass
 * `--project <ref>` to point at a staging project instead.
 *
 * `--dry-run` prints what would change and writes nothing. `--site` and `--pages` change the two
 * origins (defaults are this app's own deployments).
 *
 * ## What it does not touch
 *
 * Sign-ups, providers, JWT expiry, SMTP — every other field of the auth config is left exactly
 * as the project has it. The one other thing it *sets* is the OTP's shape (`mailer_otp_length:
 * 6`, `mailer_otp_exp: 300`), because the portal's field is six digits wide and its copy promises
 * five minutes: a project configured for eight digits would be unreachable through this screen,
 * which is a config bug that looks like a broken app.
 */

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const CONFIG = resolve(ROOT, "app/src/lib/supabase-config.ts")

const API = "https://api.supabase.com/v1"
const DEFAULT_SITE = "https://track-it-pwa.vercel.app/"
const DEFAULT_PAGES = "https://gunssaypewpew16.github.io/TrackIt/"

/** The portal's own promise: six digits, five minutes. */
const OTP_LENGTH = 6
const OTP_SECONDS = 300

/** What the mail says. The body is the reason any of this works: `.Token` is the digits. */
const MAGIC_LINK_SUBJECT = "Your TrackIt code"
const MAGIC_LINK_TEMPLATE = `<h2>Your TrackIt code</h2>
<p>Type this in the portal:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:700">{{ .Token }}</p>
<p>It expires in five minutes. If you did not ask for it, ignore this email.</p>`

const args = process.argv.slice(2)

function usage(exitCode = 0) {
  const text = `Apply this app's Supabase auth settings (code template, Site URL, redirect URLs).

  SUPABASE_ACCESS_TOKEN=sbp_... npm run setup:auth [options]

Options
  --project <ref>   Supabase project ref (default: read from app/src/lib/supabase-config.ts)
  --site <url>      Site URL, the address a mailed link lands on (default: ${DEFAULT_SITE})
  --pages <url>     Second redirect origin, added to the allow-list (default: ${DEFAULT_PAGES})
  --dry-run         Print the changes and write nothing
  --help            This text

The token is an account credential (Account → Access Tokens). It is never read from a file and
never printed. Nothing else in the project's auth config is touched.`
  console.log(text)
  process.exit(exitCode)
}

function flag(name) {
  const at = args.indexOf(`--${name}`)
  if (at === -1) return null
  const value = args[at + 1]
  if (!value || value.startsWith("--")) {
    console.error(`--${name} needs a value.`)
    process.exit(1)
  }
  return value
}

if (args.includes("--help")) usage()

const dryRun = args.includes("--dry-run")
const site = flag("site") ?? DEFAULT_SITE
const pages = flag("pages") ?? DEFAULT_PAGES
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim() ?? ""

if (!token) {
  console.error(
    "SUPABASE_ACCESS_TOKEN is not set.\n" +
      "Create one at https://supabase.com/dashboard/account/tokens, then:\n\n" +
      "  SUPABASE_ACCESS_TOKEN=sbp_... npm run setup:auth\n",
  )
  process.exit(1)
}

/** The project ref, from the same file the app reads its public URL from. */
function projectRef() {
  const explicit = flag("project") ?? process.env.SUPABASE_PROJECT_REF?.trim()
  if (explicit) return explicit
  let source = ""
  try {
    source = readFileSync(CONFIG, "utf8")
  } catch (error) {
    console.error(`Could not read ${CONFIG}: ${error.message}`)
    process.exit(1)
  }
  const match = /DEFAULT_SUPABASE_URL\s*=\s*"https:\/\/([a-z0-9-]+)\.supabase\.co"/.exec(source)
  if (!match) {
    console.error(`No project URL in ${CONFIG}. Pass --project <ref> instead.`)
    process.exit(1)
  }
  return match[1]
}

const ref = projectRef()

async function call(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // A non-JSON body is reported whole; it is usually an HTML error page.
  }
  if (!response.ok) {
    const detail = data?.message ?? data?.error ?? text.slice(0, 400)
    const hint =
      response.status === 401 || response.status === 403
        ? " — the token was refused. It must be a personal access token with access to this project."
        : response.status === 404
          ? ` — no project "${ref}" for this token.`
          : ""
    console.error(`${method} ${path} → ${response.status}${hint}\n  ${detail}`)
    process.exit(1)
  }
  return data
}

/** `a, b` and `b, c` → `a, b, c`, in the order they were first seen. */
function mergeRedirects(existing, wanted) {
  const seen = []
  for (const entry of [...(existing ?? "").split(","), ...wanted]) {
    const url = entry.trim()
    if (url && !seen.includes(url)) seen.push(url)
  }
  return seen.join(",")
}

function describe(value) {
  if (typeof value === "string" && value.includes("<")) return `${value.split("\n")[0].slice(0, 60)}… (HTML)`
  return JSON.stringify(value)
}

/**
 * Whether an origin is one only this machine can open.
 *
 * A loopback **Site URL** is the mistake this script exists to undo: Supabase rewrites every
 * mailed link's `redirect_to` to it, so the link a phone receives lands on `localhost:3000`,
 * which is the phone's own localhost and opens nothing. It is called out in the diff rather
 * than left as one more setting the owner has to recognise.
 */
function isLoopback(value) {
  return typeof value === "string" && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/.test(value)
}

const current = await call("GET", `/projects/${ref}/config/auth`)

const wanted = {
  site_url: site,
  uri_allow_list: mergeRedirects(current?.uri_allow_list, [site, pages]),
  mailer_subjects_magic_link: MAGIC_LINK_SUBJECT,
  mailer_templates_magic_link_content: MAGIC_LINK_TEMPLATE,
  mailer_otp_length: OTP_LENGTH,
  mailer_otp_exp: OTP_SECONDS,
}

const changed = Object.entries(wanted).filter(([key, value]) => current?.[key] !== value)

console.log(`\nSupabase auth — ${ref}\n`)
if (changed.length === 0) {
  console.log("  Everything already matches; nothing to write.\n")
  process.exit(0)
}

for (const [key, value] of changed) {
  console.log(`  ${key}`)
  const wasLoopback = key === "site_url" && isLoopback(current?.[key])
  console.log(`    was: ${describe(current?.[key])}${wasLoopback ? "  ← a phone cannot open this" : ""}`)
  console.log(`    now: ${describe(value)}`)
}

if (dryRun) {
  console.log("\n  Dry run: nothing was written.\n")
  process.exit(0)
}

const patch = Object.fromEntries(changed)
await call("PATCH", `/projects/${ref}/config/auth`, patch)

/** Read it back rather than trusting the write: this endpoint answers with the whole config. */
const after = await call("GET", `/projects/${ref}/config/auth`)
const wrong = Object.entries(wanted).filter(([key, value]) => after?.[key] !== value)
if (wrong.length > 0) {
  console.error(`\nThe project did not keep: ${wrong.map(([key]) => key).join(", ")}\n`)
  process.exit(1)
}

console.log(`
  Applied ${changed.length} ${changed.length === 1 ? "setting" : "settings"}.

  The mail now carries a six-digit code, the Site URL is ${site},
  and ${pages} is on the redirect allow-list. Send yourself one with the
  portal's password step to check it end to end.
`)
