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
 * ## What the project may refuse
 *
 * **A free-tier project with the built-in mail provider cannot change its mail template** — the
 * API answers `400: Email template modification ... not available for free tier projects using the
 * default email provider` — and it refuses the whole request that carries one. So the write is
 * done in two groups, URLs first, and a refusal costs only its own group: the Site URL and the
 * redirect allow-list land, the mail settings are reported as what the project would not take,
 * and the run exits 1 rather than pretending. Connect custom SMTP (**Authentication → Emails →
 * SMTP Settings**) and run it again to get the six digits.
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
  --project <ref>       Supabase project ref (default: read from app/src/lib/supabase-config.ts)
  --site <url>          Site URL, the address a mailed link lands on (default: ${DEFAULT_SITE})
  --pages <url>         Second redirect origin, added to the allow-list (default: ${DEFAULT_PAGES})
  --smtp-host <host>    Mail server host. Setting it (with the rest below) is what unlocks the
  --smtp-port <port>    mail template — Supabase refuses template edits on its own mailer.
  --smtp-user <user>
  --smtp-pass-file <path>  A file holding the SMTP password (one line). Never passed as an
                           argument, so it stays out of the shell's history and this output.
  --smtp-from <address>    The address the mail comes from (the provider's verified sender).
  --smtp-name <name>    The name in front of it (default: TrackIt)
  --dry-run             Print the changes and write nothing
  --help                This text

The token is an account credential (Account → Access Tokens). The SMTP password is read from a
file and never printed. Nothing else in the project's auth config is touched.`
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

/**
 * The mail server, when one is being configured.
 *
 * **This is the setting that unlocks the six digits.** With the project's own mailer, Supabase
 * refuses to edit a template — so a stock project can only ever mail a *link*, which is no way
 * into an installed iOS web app (a link tapped in Mail opens Safari, and that app has its own
 * storage). A project with its own SMTP may edit its templates, which is what puts `{{ .Token }}`
 * in the mail and a six-digit code on the screen. The password is read from a **file** rather
 * than an argument: an argument is in the shell's history and in this output.
 */
const smtpHost = flag("smtp-host") ?? process.env.SUPABASE_SMTP_HOST?.trim() ?? ""
const smtpPort = flag("smtp-port") ?? "465"
const smtpUser = flag("smtp-user") ?? process.env.SUPABASE_SMTP_USER?.trim() ?? ""
const smtpFrom = flag("smtp-from") ?? process.env.SUPABASE_SMTP_FROM?.trim() ?? ""
const smtpName = flag("smtp-name") ?? process.env.SUPABASE_SMTP_NAME?.trim() ?? "TrackIt"
const smtpPassFile = flag("smtp-pass-file") ?? process.env.SUPABASE_SMTP_PASSWORD_FILE?.trim() ?? ""
const smtpWanted = Boolean(smtpHost)

if (smtpWanted && (!smtpUser || !smtpFrom || !smtpPassFile)) {
  console.error(
    "--smtp-host also needs --smtp-user, --smtp-from and --smtp-pass-file (host, username, the\n" +
      "address the mail comes from, and a file with the password).\n",
  )
  process.exit(1)
}

let smtpPass = ""
if (smtpWanted) {
  try {
    // One line, and any newline the file ends with is not part of the password.
    smtpPass = readFileSync(smtpPassFile, "utf8").trim()
  } catch (error) {
    console.error(`Could not read the SMTP password from ${smtpPassFile}: ${error.message}`)
    process.exit(1)
  }
  if (!smtpPass) {
    console.error(`${smtpPassFile} is empty.`)
    process.exit(1)
  }
}

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

/**
 * One call, with the failure handed back rather than thrown.
 *
 * Writing is done in groups (below) precisely because **a refusal is sometimes only about part
 * of the config**: a free-tier project refuses the mail template and answers 400 for the whole
 * request it arrives in, which would take the redirect fix down with it. Reading the status and
 * the message back lets the URL settings land and the refusal be reported as what it is.
 */
async function request(method, path, body) {
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
    return { ok: false, status: response.status, detail, hint, data: null }
  }
  return { ok: true, status: response.status, detail: null, hint: "", data }
}

/** A call this script cannot go on without: a refusal here ends the run. */
async function call(method, path, body) {
  const result = await request(method, path, body)
  if (!result.ok) {
    console.error(`${method} ${path} → ${result.status}${result.hint}\n  ${result.detail}`)
    process.exit(1)
  }
  return result.data
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
  ...(smtpWanted
    ? {
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_user: smtpUser,
        smtp_pass: smtpPass,
        smtp_admin_email: smtpFrom,
        smtp_sender_name: smtpName,
      }
    : {}),
}

/**
 * What differs. The SMTP password is always written.
 *
 * Supabase does not read it back — no API in this project returns it — so there is nothing to
 * compare it against, and a run that left it out would leave a rotated password in the old
 * server's hands. It is sent every time, and the diff says so instead of pretending to compare.
 */
const changed = Object.entries(wanted).filter(
  ([key, value]) => key === "smtp_pass" || current?.[key] !== value,
)

console.log(`\nSupabase auth — ${ref}\n`)
if (changed.length === 0) {
  console.log("  Everything already matches; nothing to write.\n")
  process.exit(0)
}

for (const [key, value] of changed) {
  console.log(`  ${key}`)
  // The password is never echoed, in either column: this output is a terminal's history.
  if (key === "smtp_pass") {
    console.log("    was: (never read back)")
    console.log(`    now: (the ${Buffer.byteLength(value, "utf8")} bytes from ${smtpPassFile})`)
    continue
  }
  const wasLoopback = key === "site_url" && isLoopback(current?.[key])
  console.log(`    was: ${describe(current?.[key])}${wasLoopback ? "  ← a phone cannot open this" : ""}`)
  console.log(`    now: ${describe(value)}`)
}

if (dryRun) {
  console.log("\n  Dry run: nothing was written.\n")
  process.exit(0)
}

/**
 * The settings, in the three groups the project treats differently.
 *
 * The URLs are ordinary configuration. The mail template is not: **a project on Supabase's own
 * mailer cannot change its templates at all** — the dashboard will not offer it and the API answers
 * 400 with *Email template modification is not available for free tier projects using the default
 * email provider* — and because that refusal arrives for the whole request, sending it alongside
 * the URLs would lose them too. A project with its own SMTP has no such limit, which is why the
 * mail server is written **before** the template: the template is only editable once it exists.
 */
const GROUPS = [
  { name: "the redirect settings", keys: ["site_url", "uri_allow_list"], mail: false },
  {
    name: "the mail server",
    keys: ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_admin_email", "smtp_sender_name"],
    mail: false,
  },
  {
    name: "the mail template",
    keys: [
      "mailer_subjects_magic_link",
      "mailer_templates_magic_link_content",
      "mailer_otp_length",
      "mailer_otp_exp",
    ],
    mail: true,
  },
]

const refusals = []
let applied = 0

for (const group of GROUPS) {
  const patch = Object.fromEntries(changed.filter(([key]) => group.keys.includes(key)))
  const count = Object.keys(patch).length
  if (count === 0) continue
  const result = await request("PATCH", `/projects/${ref}/config/auth`, patch)
  if (result.ok) {
    applied += count
    continue
  }
  refusals.push({
    name: group.name,
    keys: Object.keys(patch),
    status: result.status,
    detail: result.detail,
    hint: result.hint,
    mail: group.mail,
  })
}

/**
 * Read it back rather than trusting the write: this endpoint answers with the whole config.
 *
 * Only what the project **accepted** is held to it. A setting it refused is not a write that
 * failed to stick — it is a write it would not take, reported above on its own.
 */
const after = await call("GET", `/projects/${ref}/config/auth`)
const refusedKeys = new Set(refusals.flatMap((refusal) => refusal.keys))
const wrong = Object.entries(wanted).filter(([key, value]) => {
  if (refusedKeys.has(key)) return false
  // The password is the one setting with nothing to compare it to at all: this API never
  // returns it, so there is no read-back to hold it to. It was written; whether the mail server
  // accepts it is only knowable by the mail server.
  if (key === "smtp_pass") return false
  return after?.[key] !== value
})

if (applied > 0) console.log(`\n  Applied ${applied} ${applied === 1 ? "setting" : "settings"}.`)
if (smtpWanted && applied > 0) {
  console.log(
    "\n  The SMTP password is written on every run and never read back — Supabase does not return\n" +
      "  it, so this is the one setting only the mail server can confirm. Send yourself a code to\n" +
      "  check it end to end.",
  )
}

for (const refusal of refusals) {
  console.error(
    `\n  The project refused ${refusal.name} (${refusal.keys.join(", ")}) — ${refusal.status}.\n  ${refusal.detail}`,
  )
  if (refusal.mail && !smtpWanted) {
    console.error(
      `
  That is Supabase's own mailer: it refuses every template edit, so the six-digit code step
  cannot be fed, and the mail carries a link and no digits. A link is no way into an installed
  iOS web app — it opens in Safari, whose storage that app cannot see — which is what the
  portal's paste path works around. To get the digits, give the project a mail server:

    npm run setup:auth -- --smtp-host <host> --smtp-port 465 --smtp-user <user> \\
      --smtp-from <verified sender> --smtp-pass-file <file with the password>

  and run it again — the template is written in that same pass, once the mail server is there.
`,
    )
  }
  if (refusal.mail && smtpWanted) {
    console.error(
      `
  The mail server was accepted and the template alone was not, which is the opposite of the
  usual refusal. Supabase's own message above is the one to act on; re-running is worth a try.
`,
    )
  }
}

if (wrong.length > 0) {
  console.error(`\nThe project does not read back as asked: ${wrong.map(([key]) => key).join(", ")}\n`)
  process.exit(1)
}

if (refusals.length > 0) {
  console.error(`  The settings above are as asked for; the refused ones are not, and cannot be until the\n  project can hold them.\n`)
  process.exit(1)
}

console.log(
  smtpWanted
    ? `\n  The mail now carries a six-digit code, the Site URL is ${site},\n  and ${pages} is on the redirect allow-list.\n`
    : `\n  The mail now carries a six-digit code, the Site URL is ${site},\n  and ${pages} is on the redirect allow-list. Send yourself one with the\n  portal's password step to check it end to end.\n`,
)
