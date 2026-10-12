# TrackIt

A mobile-first, installable **expense tracker PWA** built for iPhone.

Local-first: every expense lives in IndexedDB on the device, so the app works
fully offline. A small Cloudflare Worker exposes a token-protected API so an
**Apple Shortcut** can log transactions automatically without opening the app.

## Stack

| Layer     | Choice                                            |
| --------- | ------------------------------------------------- |
| UI        | React 19 + TypeScript, Vite 8                     |
| PWA       | `vite-plugin-pwa` (Workbox service worker + manifest) |
| Storage   | IndexedDB via `idb`, local-first                  |
| API       | Cloudflare Worker (`worker/index.ts`) + D1 (SQLite) |

## Getting started

```bash
npm install
npm run dev        # app on http://localhost:5173
```

`npm run dev` proxies `/api/*` to the Worker, so start the API in a second
terminal when you need sync or the Shortcuts endpoint:

```bash
cp .dev.vars.example .dev.vars   # then edit API_TOKEN
npm run dev:api                  # Worker + local D1 on http://localhost:8787
```

To exercise the exact production shape (built assets **and** API on one origin):

```bash
npm run build
npx wrangler dev --port 8787     # open http://localhost:8787
```

## Layout

```
src/
  components/     HomeScreen, AddExpenseSheet, SettingsScreen, TabBar, ExpenseRow
  hooks/          useExpenses — owns expense state
  lib/
    db.ts         IndexedDB store (source of truth)
    api.ts        HTTP client for the Worker
    sync.ts       two-way merge (last-write-wins on updatedAt)
    format.ts     money/date helpers (money is stored as integer cents)
    types.ts      domain types + categories
worker/
  index.ts        Worker: /api routes first, then static assets
  schema.sql      D1 schema (the Worker also creates it on first use)
```

## Apple Shortcuts → TrackIt

Once deployed, an expense can be logged from anywhere:

1. **Shortcut** → new shortcut → **Get Contents of URL**
2. **URL**: `https://<your-domain>/api/expense`
3. **Method**: `POST`
4. **Headers**: `Authorization` = `Bearer <API_TOKEN>`
5. **Request Body**: JSON

```json
{ "amount": 12.5, "category": "food", "note": "Lunch" }
```

`amount` may be a number (`12.5`) or a string (`"12.50"`); `category`, `note`,
`currency` and `date` (`YYYY-MM-DD`) are optional. The Worker is deliberately
forgiving — `description`, `memo` and `title` are all accepted as the note.

Then open TrackIt → **Settings → Sync now** and the new rows are pulled in.
Shortcut-sourced rows are tagged with an `AUTO` badge.

## API

| Method   | Path                | Purpose                          |
| -------- | ------------------- | -------------------------------- |
| `GET`    | `/api/health`       | liveness probe (no auth)         |
| `POST`   | `/api/expense`      | create one expense (Shortcuts)   |
| `POST`   | `/api/expenses`     | upsert many (used by sync)       |
| `GET`    | `/api/expenses`     | list (`?since=<iso>&limit=<n>`)  |
| `DELETE` | `/api/expense/:id`  | delete one                       |

All routes except `/api/health` require `Authorization: Bearer <API_TOKEN>`.
The Worker returns `401` without it.

## Deploying

```bash
npx wrangler d1 create trackit-db   # paste the id into wrangler.toml
npm run deploy                      # builds, then `wrangler deploy`
npx wrangler secret put API_TOKEN   # set the same token in Settings
```

## Scripts

| Script              | Does                                              |
| ------------------- | ------------------------------------------------- |
| `npm run dev`       | Vite dev server                                   |
| `npm run dev:api`   | Worker + local D1 on :8787                        |
| `npm run build`     | typecheck + production build to `dist/`           |
| `npm run typecheck` | `tsc -b` across app, node and worker projects     |
| `npm run lint`      | oxlint                                            |
| `npm run icons`     | regenerate PWA icons from `public/logo.svg`       |
| `npm run db:local`  | apply `worker/schema.sql` to the local D1         |
| `npm run deploy`    | build + `wrangler deploy`                         |

## iPhone notes

- Install via **Safari → Share → Add to Home Screen**; it then launches
  standalone, full-screen, with safe-area padding for the notch and home bar.
- The app requests persistent storage (`navigator.storage.persist()`) so iOS is
  less likely to evict your data — but use **Settings → Export** to keep backups.
- Push notifications and Background Sync are **not** supported by iOS PWAs, so
  sync is manual (Settings → Sync now) rather than automatic.
