# The cloud half: Supabase

TrackIt works with no server at all — that is still the default, and a build with no Supabase
values behaves exactly as it did before this folder existed. Point it at a Supabase project and
the ledger follows the account between devices, with the device's own `localStorage` kept as the
read cache so an installed app still opens with no signal.

Two files do the work: [`schema.sql`](schema.sql) is the database, and
`app/src/lib/cloud.ts` + `app/src/hooks/useAuth.tsx` are the client.

## 1. Create the database

1. Open the project's **SQL Editor** → *New query*.
2. Paste all of [`schema.sql`](schema.sql) and press **Run**.
3. Re-run it whenever this file changes: every statement is written to be safe twice
   (`create … if not exists`, `drop policy if exists`, `create or replace`).

That creates `profiles`, `ledgers` and `budgets`, turns on row-level security for each, adds the
policies that tie every row to `auth.uid()`, and installs the trigger that gives a new account its
`profiles` row.

## 2. Turn on the sign-in method

**Authentication → Sign In / Providers → Email**:

- *Enable email provider*: on (it is on by default).
- **Confirm email**: off. Every account here is made by hand in the dashboard (see §5), and *Add
  user → Auto Confirm User* does the same job per account — but with sign-ups closed the switch
  costs nothing and saves a broken-account hunt later.
- *Minimum password length*: the app refuses fewer than 8 characters, so a higher minimum here is
  fine and a lower one is moot.

**Authentication → Sign In / Providers → user sign-ups**: turn **Allow new users to sign up**
*off*. That is the fence — the app also hides its create-account form and refuses `signUp`
(`app/src/lib/portal.ts`), but only the project can refuse a row in `auth.users`.

### The second step: the six digits

The portal asks for the password, then for a **six-digit code that Supabase emails**. That code is
Supabase's `{{ .Token }}` — and Supabase's stock *Magic Link* template contains only
`{{ .ConfirmationURL }}`, a link, so the code step would have nothing to read. Paste this as the
**Magic Link** template's message body (**Authentication → Emails → Magic Link**):

```html
<h2>Your TrackIt code</h2>
<p>Type this in the portal:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:700">{{ .Token }}</p>
<p>It expires in five minutes. If you did not ask for it, ignore this email.</p>
```

**A project on Supabase's own mailer cannot edit this template at all.** Supabase refuses it in
both places — the dashboard offers no editor, and the Management API answers `400: Email template
modification is not available for free tier projects using the default email provider` — so the
mail carries the link and no digits. A project with **its own SMTP** has no such limit, and the
same command configures both, because the mail server is what unlocks the template:

```bash
npm run setup:auth -- \
  --smtp-host smtp.gmail.com --smtp-port 465 \
  --smtp-user priyanshdhoot0611@gmail.com \
  --smtp-from priyanshdhoot0611@gmail.com --smtp-pass-file ~/.trackit-smtp
```

**The code's width is the project's setting, not the app's.** `mailer_otp_length` is set to six
below, and the portal's field takes six to eight and sends whatever arrived: this project's own
`generate_link` hands back **eight** digits, so a field that insisted on six would truncate a
code that is otherwise perfectly good — which is a sign-in that fails with nothing on screen to
explain it.

`~/.trackit-smtp` holds the SMTP password on one line — today a **Gmail app password**, which
Google only offers once **2-Step Verification** is on for the sending account (Security →
2-Step Verification → App passwords; it is 16 letters and Google shows it exactly once). The file
is read and never printed, which keeps it out of the shell's history. The SMTP settings are
written first and the template in the same pass, so one command is the whole thing.

**Why Gmail, and not Resend.** Resend without a verified domain can only mail **the address its
account was made with** ([their
note](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)); the API key answers
`403 You can only send testing emails to your own email address (…)` for anyone else. One
recipient is exactly the shape a single-account vault has, and it stops being true the moment
there is a second account: Supabase keeps **one** SMTP configuration for the whole project, so
the mail server has to reach every address, and no arrangement of a single Resend account can
mail two. That is what moved this project to Gmail — an app password has no recipient rule.
(Brevo and Mailjet are the other domain-free route: both let you verify one *sender* address and
then mail anybody.) A verified domain is still the better answer the day this holds more than a
household: a `@gmail.com` From cannot be DKIM-aligned by whoever relaying it, so a copy of the
code can land in spam.

Until a mail server is there, the **link** is how a desk signs in: it comes back to this app's
own address, which adopts the session it carries (see below). Inside an installed iOS web app
that does not work — a link tapped in Mail opens Safari, whose storage that app cannot see — and
that is what the portal's **paste** step is for: the code line takes the link too, and
`verifyOtp({ token_hash })` spends it exactly as opening it would (`lib/mail-link.ts`). The
digits are the only proof that can be *typed* inside the installed app, so they are the thing
worth having; the paste is the way through until then.

Two things follow from that, and both are worth knowing before they surprise you: the code is
the *only* way in **once the template carries it** (the password alone never opens the vault —
the app throws that session away), and Supabase's built-in mailer is rate-limited to a handful of
messages an hour, so testing the portal repeatedly will stop sending. Connect custom SMTP
(**Authentication → Emails → SMTP Settings**) if that becomes the limit rather than the guard.

The app's second step is checked with `verifyOtp({ type: "email" })`, so the **only** thing that
has to be true for a code to exist is that template edit. **With the stock template the mail
arrives with a link and no digits** — the portal's paragraph names both halves now, so the link on
the phone is the way through, and a sign-in that goes quiet after the password is the state to
check that first.

### The link, as the fallback

The link the stock template sends is not wasted: the app asks Supabase to send it back to its own
address (`emailRedirectTo`, `hooks/useAuth.tsx`), and a session that arrives in the URL hash is
adopted and marked as having proved the mailbox — the same proof the digits give. So either half
of the mail opens the vault, and a template that has not been edited yet is not a dead end.

That only works for an origin Supabase is allowed to redirect to. **Authentication → URL
Configuration**:

- **Site URL** — the address people actually open: `https://track-it-pwa.vercel.app/`.
- **Redirect URLs** — add both live origins, exactly, with the trailing slash:
  `https://track-it-pwa.vercel.app/` and `https://gunssaypewpew16.github.io/TrackIt/`. Anything
  not on this list is replaced with the Site URL, which is how a mailed link ends up pointing at
  `localhost:3000` on a phone that cannot open it.

**Forgot password?** mails a link whose target is that same Site URL, so the two settings fix it
together.

### All three of those settings, in one command

The template above and the two URL settings are the steps most often forgotten, because they are
the only part of this setup that lives in a dashboard rather than in the repository. They can be
applied from the terminal instead — the same three edits through the **Management API**:

```bash
SUPABASE_ACCESS_TOKEN=sbp_xxxx npm run setup:auth
```

The token is a **personal access token** from *Account → Access Tokens*
(`https://supabase.com/dashboard/account/tokens`), not the project's publishable key: it is an
account credential, so it belongs in the shell for one command and never in this repository. The
script (`tools/supabase-auth.mjs`) writes the Magic Link body with `{{ .Token }}`, the Site URL,
the redirect allow-list and, when it is given one, the project's own mail server — reads the
config back to prove the write landed, and leaves every other field of the auth config alone.
Run it again and it says everything already matches, bar the SMTP password, which Supabase never
returns and which is therefore re-sent each time. `--dry-run` prints the diff and writes nothing,
`--project <ref>` points it at a staging project, and `--help` lists the rest.

## 3. Give the app the two public values

**Settings → API** (or *API Keys*): copy the **Project URL** and the **publishable / anon** key.
Both are public — they ship inside the JavaScript bundle — and both are useless without a session,
because every table's policy names `auth.uid()`. The **service role** key must never go near this
app.

Locally, `app/.env.local` (git-ignored):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable or anon key>
```

Vite only exposes `VITE_`-prefixed names, and only at build time. **The two values also live in
the source** — `app/src/lib/supabase-config.ts` — and that is what every deployment uses unless it
sets its own, so Vercel (the default site) and GitHub Pages are both the online app with no
dashboard step. They are public: the key is in every bundle already, and RLS is what protects the
rows. Override them per build with the same two `VITE_` names, or with `VITE_CLOUD=off` for a
device-only build (`npm run check:flows` does the latter):

- **GitHub Pages** → repo → Settings → Secrets and variables → **Actions → Variables** also holds
  both, and `.github/workflows/deploy-pages.yml` passes them to the build, so the Pages URL
  (`https://gunssaypewpew16.github.io/TrackIt/`) is the online app: the portal, the six digits, and
  the sign-out behind the greeting's name.
- **Vercel** → nothing to set: the deployment builds from this source and picks up the committed
  default. If a preview should point at another project, add the two names in *Settings →
  Environment Variables* and they win.

Check that a deploy really is the online app — a device-only build has no portal at all. The
Supabase client is a **lazy chunk**, so look in every `assets/*.js`, not only the entry:

```bash
BASE=https://track-it-pwa.vercel.app          # or https://gunssaypewpew16.github.io/TrackIt
curl -s -L "$BASE/" | grep -o 'assets/[A-Za-z0-9_.-]*\.js' | sort -u | \
  while read -r f; do curl -s "$BASE/$f" | grep -lq '<project-ref>.supabase.co' && echo "$f"; done
```

The page itself is the simpler check: the default site must open on **Access your financial
Vault**, and a wrong password there must answer *That email and password don't match.* — that
string only arrives from Supabase.

## 4. Check the fence

With only the publishable key, the tables must answer with nothing:

```bash
curl -s "$URL/rest/v1/ledgers?select=id" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
# → [] (200). An empty array, not a list of rows: RLS filters, it does not refuse.
```

And a write must be refused outright:

```bash
curl -s -X POST "$URL/rest/v1/ledgers" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"user_id":"00000000-0000-0000-0000-000000000000","amount":1,"client_id":"probe"}'
# → {"code":"42501","message":"new row violates row-level security policy …"} (403)
```

Two signed-in accounts must not see each other's rows. The app keeps a cache per account
(`trackit-ledger:u:<uuid>`), so signing out and in as somebody else cannot show the previous
account's money.

## 5. The two accounts, their names, and the ledger's first home

Accounts are made **in the dashboard**, not in the app: **Authentication → Users → Add user**,
with the address, the password and **Auto Confirm User** ticked. Add
`{"full_name": "Priyansh"}` to that dialog's *User Metadata* field (and
`{"full_name": "Nimisha"}` to the other) — the `on_auth_user_created` trigger copies it into
`profiles.full_name`, which is the name the greeting says. If an account was made without it,
one line fixes it:

```sql
update public.profiles set full_name = 'Nimisha'
 where id = (select id from auth.users where email = 'dhootnimisha4@gmail.com');
```

**The greeting name is the account's, not the app's.** `lib/profile.ts` reads
`profiles.full_name`, falls back to the sign-up metadata, and only then to the email's local part;
`OWNER_NAME` in `lib/owner.ts` now only stands in for a build with no account at all.

**The vault's history is claimed by its owner, once.** The Wallet sheet this app has always
bundled lives in the device's `localStorage`. The first time the account the app greets by name
(`OWNER_NAME` — *Priyansh*) signs in to an **empty** cloud shelf, `claimDeviceLedger` in
`app/src/lib/cloud.ts` upserts those rows (keeping their `client_id`s, so it is an ordinary
idempotent push) and the account's ledger is the imported one everywhere from then on. Every
other account starts empty and stays empty; a second device cannot re-seed a shelf the owner has
since edited; and `trackit-claim:<uuid>` on the device means deliberately clearing the vault is
not undone by the next sign-in.

To start that account's history from scratch instead, delete its rows and the claim marker:

```sql
delete from public.ledgers where user_id = (select id from auth.users where email = 'priyanshdhoot0611@gmail.com');
```

## The secrets, and where each one lives

Five credentials touch this project, and none of them belongs in the repository. Which is which,
and what to do when one has to be replaced:

| Secret | Where it lives | Where it comes from |
| --- | --- | --- |
| **Personal access token** (`sbp_…`) | Nowhere. It is typed into the shell for one command (`SUPABASE_ACCESS_TOKEN=… npm run setup:auth`) and never written to a file. | Account → **Access Tokens** |
| **Mail server password** — a Gmail **app password** today | `~/.trackit-smtp`, one line, mode `600`, outside the repository — the file `--smtp-pass-file` reads. Supabase also holds a copy as its `smtp_pass`, server-side. | Google Account → **Security → App passwords** (needs 2-Step Verification on) |
| **Project URL + publishable key** | In the source (`app/src/lib/supabase-config.ts`) and in `app/.env.local` (git-ignored). Public by design: they ship inside every bundle, and RLS is what protects the rows. | Settings → **API** |
| **`service_role` key** | Never here — not in this repository, not in the app, and not in the built bundle. A test harness may fetch it into memory for one run (to mint a link) and drop it; it is never written or printed. | Settings → **API** (do not copy it into anything that ships) |
| **The portal account's password** (`TRACKIT_TEST_EMAIL` / `TRACKIT_TEST_PASSWORD`) | Nowhere. Exported for one `npm run check:flows` run and gone with the shell. With neither set the suite checks the portal's own screens and exits **2**, never 0, rather than reporting a sign-in it did not do. | The account itself, made in the dashboard |

**Replacing one.** A new mail password: create another app password at Google (delete the spent
one in the same screen), save it to `~/.trackit-smtp`, and re-run `npm run setup:auth` with the
same `--smtp-*` arguments — the password is written on every run precisely because Supabase never
reads it back, so rotating is that one command. A new personal access token: nothing to update, it
is only ever typed. A new account password: change it in the dashboard and export the new one next
time — nothing in the tree remembers the old one.

**The Resend key this project used before Gmail is dead weight now** — nothing configures it any
more, and the copy in `~/.trackit-smtp` was overwritten in place. Revoke it in Resend's dashboard
(**API Keys**) so a key nobody can use stops existing.

**A leaked credential is revoked where it was issued** — Supabase: Account → Access Tokens;
Google: Security → App passwords; Resend: API Keys — and nothing in this repository can do that
for you. Revoking is the only thing that actually stops it working.

**What keeps them out.** `.gitignore` covers `*.local`, `.dev.vars` and `.wrangler`, and now
`.trackit-smtp` as well — belt and braces, because the file these docs tell you to write lives in
your home directory rather than the working tree, and the ignore rule is only there for the day
somebody writes it in the wrong place. Nothing in this project reads a secret out of the
repository: `npm run check:flows` runs on a throwaway profile with no credentials at all, and the
one place a token is ever typed is a command line.

## Running without it

No values → no gate, no network calls, and the app is the device-only tracker it has always been.
`VITE_CLOUD=off` forces that mode even when the values are present, which is what
`npm run check:flows` uses when it has no test account to sign in with. Sign-ups can be opened
for a staging project with `VITE_SIGNUP=on`; the default is closed.
