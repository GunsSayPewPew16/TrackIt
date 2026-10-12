-- TrackIt schema (D1 / SQLite).
-- The Worker creates this automatically on first request; this file documents
-- it and can be applied manually with:
--   wrangler d1 execute trackit-db --local --file=worker/schema.sql

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  category TEXT NOT NULL DEFAULT 'unknown',
  note TEXT NOT NULL DEFAULT '',
  spent_at TEXT NOT NULL, -- local calendar date, YYYY-MM-DD
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'shortcut'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expenses_spent_at ON expenses (spent_at DESC);
