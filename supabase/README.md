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
- **Confirm email**: off, if you want a new account to be usable the moment it is created. Left on,
  Supabase sends a confirmation link and the app shows *"Check your inbox"* until it is clicked —
  which is the better setting for a real deployment and the worse one for trying the app.
- *Minimum password length*: the app refuses fewer than 8 characters, so a higher minimum here is
  fine and a lower one is moot.

Nothing else is needed for sign-in: the app has no redirect URLs to configure, because every
session it wants is established on the device that typed the password (no magic links, no OAuth).

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

## Running without it

No values → no gate, no network calls, and the app is the device-only tracker it has always been.
`VITE_CLOUD=off` forces that mode even when the values are present, which is what
`npm run check:flows` uses when it has no test account to sign in with.
