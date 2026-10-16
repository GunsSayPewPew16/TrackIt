-- TrackIt schema (D1 / SQLite).
-- The Worker creates this automatically on first request; this file documents
-- it and can be applied manually with:
--   wrangler d1 execute trackit-db --local --config backend/wrangler.toml --file=backend/schema.sql

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  kind TEXT NOT NULL DEFAULT 'expense', -- 'expense' | 'income'
  category TEXT NOT NULL DEFAULT 'unknown',
  note TEXT NOT NULL DEFAULT '',
  spent_at TEXT NOT NULL, -- local calendar date, YYYY-MM-DD
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'shortcut'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expenses_spent_at ON expenses (spent_at DESC);

-- The greeting's table: fifty hellos, one per language, and the data behind the app's
-- masthead. The Worker creates it and fills it from `app/src/lib/greetings.ts` the first
-- time `POST /api/greeting` is asked, so nothing has to be run for the greeting to work.
--
-- It is a table, and not an array in the app, so that a word can be changed without a
-- rebuild:
--   wrangler d1 execute trackit-db --remote --config backend/wrangler.toml \
--     --command "UPDATE greetings SET word = 'Kia ora,' WHERE language = 'Maori'"
--
-- `language` is the key rather than `word`, because two languages may greet one another
-- with the same word (Swedish and Danish both say "Hej") and because the language's name is
-- what a caller names in `avoid` when it has just shown one.
CREATE TABLE IF NOT EXISTS greetings (
  language TEXT PRIMARY KEY,
  word TEXT NOT NULL,
  lang TEXT NOT NULL
);
