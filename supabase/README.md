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

Two things follow from that, and both are worth knowing before they surprise you: the code is
the *only* way in (the password alone no longer opens the vault — the app throws its session
away), and Supabase's built-in mailer is rate-limited to a handful of messages an hour, so
testing the portal repeatedly will stop sending. Connect custom SMTP
(**Authentication → Emails → SMTP Settings**) if that becomes the limit rather than the guard.

Nothing else is needed for sign-in: the app has no redirect URLs to configure, because the
session is established on the device that typed the password (no OAuth, no magic links).

The one exception is **Forgot password?**. Supabase mails a link whose target comes from
**Authentication → URL Configuration → Site URL**, so set that to the origin people actually use
(`https://track-it-pwa.vercel.app/` or the Pages URL). Left at `localhost:3000` the mail arrives
but its link goes nowhere, and the portal's own copy promises only that the link was sent.

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

Vite only exposes `VITE_`-prefixed names, and only at build time — so each host needs them too:

- **Vercel** → Project → Settings → Environment Variables: add both for *Production* (and
  *Preview* if you want previews signed in), then redeploy.
- **GitHub Pages** → repo → Settings → Secrets and variables → **Actions → Variables**: add both
  with the same names. `.github/workflows/deploy-pages.yml` passes them to the build.

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

## Running without it

No values → no gate, no network calls, and the app is the device-only tracker it has always been.
`VITE_CLOUD=off` forces that mode even when the values are present, which is what
`npm run check:flows` uses when it has no test account to sign in with. Sign-ups can be opened
for a staging project with `VITE_SIGNUP=on`; the default is closed.
