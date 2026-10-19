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

-- The greeting's table: eighty words — twenty languages with a word for each part of the
-- day — and the data behind the app's masthead. The Worker creates it and fills it from
-- `app/src/lib/greetings.ts` the first time `POST /api/greeting` is asked, so nothing has to
-- be run for the greeting to work.
--
-- It is a table, and not an array in the app, so that a word can be changed without a
-- rebuild:
--   wrangler d1 execute trackit-db --remote --config backend/wrangler.toml \
--     --command "UPDATE hourly_greetings SET word = 'Kia ora,' \
--                 WHERE language = 'Maori' AND slot = 'morning'"
--
-- `(language, slot)` is the key rather than `word`: a language has four words here, one per
-- part of the day (`slot` is 'morning' | 'afternoon' | 'evening' | 'night'), and `language`
-- is also the name a caller sends back in `avoid` when it has just shown one. A language
-- whose own day has one word for two parts of it (Spanish says `Buenas noches` in the
-- evening and at night) has the same word in two rows.
--
-- The table this replaces was `greetings`: fifty all-hour hellos, keyed by language, with no
-- hour in a row to filter on. Nothing reads it now, and it can be dropped with
-- `--command 'DROP TABLE greetings'`.
CREATE TABLE IF NOT EXISTS hourly_greetings (
  language TEXT NOT NULL,
  slot TEXT NOT NULL, -- 'morning' | 'afternoon' | 'evening' | 'night'
  word TEXT NOT NULL,
  lang TEXT NOT NULL,
  PRIMARY KEY (language, slot)
);
