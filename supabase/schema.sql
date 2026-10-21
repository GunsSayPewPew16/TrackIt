-- TrackIt · the cloud half of the ledger.
--
-- Run this once in the Supabase dashboard (SQL Editor → New query → paste → Run). It is
-- idempotent: every statement guards itself, so re-running it after adding a column is safe.
--
-- Two things are being built here, and the second is why the file is longer than a schema:
--
-- 1. **The tables the app syncs.** `profiles` (account metadata), `ledgers` (one row per
--    transaction) and `budgets` (the envelopes the dashboard measures spending against).
-- 2. **The fence around them.** Every table has row-level security on, with policies that
--    name `auth.uid()` on both the read and the write side, so the publishable key that ships
--    in the app can only ever see the rows of the account that is signed in. That key is
--    public by design — the policies are the protection, not the key.
--
-- The money is stored as `numeric(12,2)` rupees, exactly as the owner asked; the app keeps
-- integer paise in memory and converts at this boundary only (`app/src/lib/cloud.ts`).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  full_name text,
  avatar_url text,
  is_dark_mode boolean not null default true
);

comment on table public.profiles is 'One row per account. Created by the trigger below on sign-up.';

-- ---------------------------------------------------------------------------
-- ledgers
-- ---------------------------------------------------------------------------
-- `client_id` is the app's own row id (`manual-…`, or a Wallet import's id). It is what makes
-- a push idempotent: importing the same backup twice, or flushing a queued write twice,
-- upserts onto the same row instead of duplicating it. `id` stays a uuid so the table is
-- addressable from SQL and from a future admin UI.
--
-- `kind` is the column the app cannot live without: an income row that lands in this table
-- without it would be counted as spending by every figure on the dashboard. `occurred_at` is
-- the moment the money moved (what the date pill edits), while `created_at` is when the row
-- reached the cloud; the two differ whenever an expense is remembered late.
create table if not exists public.ledgers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  amount numeric(12, 2) not null check (amount >= 0),
  account_type text not null default '',
  description text not null default '',
  category text not null default '',
  sub_category text,
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  note text,
  source text,
  occurred_at timestamptz not null default now(),
  client_id text not null,
  unique (user_id, client_id)
);

create index if not exists ledgers_user_occurred_idx
  on public.ledgers (user_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- budgets
-- ---------------------------------------------------------------------------
-- The dashboard's envelopes (`Budget` in app/src/lib/types.ts): a name, a limit and the
-- categories it covers. `category_ids` is a text[] because the app's own shape is an array of
-- category ids, and a join table for at most six ids would be a table nobody queries.
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  client_id text not null,
  name text not null,
  limit_amount numeric(12, 2) not null check (limit_amount >= 0),
  category_ids text[] not null default '{}',
  start_date timestamptz not null default now(),
  unique (user_id, client_id)
);

create index if not exists budgets_user_idx on public.budgets (user_id);

-- ---------------------------------------------------------------------------
-- profiles.updated_at, kept honest by the table rather than by the caller
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- a profile for every account, made when the account is
-- ---------------------------------------------------------------------------
-- Security definer because `auth.users` is not writable from a client, and `search_path = ''`
-- so nothing in this function can be hijacked by a schema someone else created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- row-level security: the whole point of the file
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.ledgers enable row level security;
alter table public.budgets enable row level security;

-- profiles: a row is yours when it is your id. `with check` is stated separately because the
-- insert and the update sides are enforced by different clauses, and leaving it out is how a
-- policy ends up letting you write somebody else's row.
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles: delete own" on public.profiles;
create policy "profiles: delete own" on public.profiles
  for delete using (auth.uid() = id);

-- ledgers and budgets: one policy per verb, each naming the owner on both sides. A row can
-- only be inserted under your own id, and can only be read, changed or removed when it is
-- already yours.
drop policy if exists "ledgers: read own" on public.ledgers;
create policy "ledgers: read own" on public.ledgers
  for select using (auth.uid() = user_id);

drop policy if exists "ledgers: insert own" on public.ledgers;
create policy "ledgers: insert own" on public.ledgers
  for insert with check (auth.uid() = user_id);

drop policy if exists "ledgers: update own" on public.ledgers;
create policy "ledgers: update own" on public.ledgers
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ledgers: delete own" on public.ledgers;
create policy "ledgers: delete own" on public.ledgers
  for delete using (auth.uid() = user_id);

drop policy if exists "budgets: read own" on public.budgets;
create policy "budgets: read own" on public.budgets
  for select using (auth.uid() = user_id);

drop policy if exists "budgets: insert own" on public.budgets;
create policy "budgets: insert own" on public.budgets
  for insert with check (auth.uid() = user_id);

drop policy if exists "budgets: update own" on public.budgets;
create policy "budgets: update own" on public.budgets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "budgets: delete own" on public.budgets;
create policy "budgets: delete own" on public.budgets
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- grants: the Data API's door, separate from the policies above
-- ---------------------------------------------------------------------------
-- From 30 October 2026 Supabase no longer grants the Data API access to new tables in `public`
-- automatically, and a table without a grant answers "permission denied" before any policy is
-- read. Existing tables keep their grants; these lines are for the tables above, and re-running
-- this file applies them (grants are idempotent).
--
-- Supabase's default grants can still hand every role the full set of table privileges, so the
-- revoke comes first and takes back everything. TRUNCATE is the one that matters: Postgres does
-- not apply row-level security to it, so a signed-in owner could otherwise empty a table of every
-- account's rows. The app never needs it, and it never uses `service_role` either.
--
-- Then the four operations the app uses are granted back to `authenticated` (the signed-in owner,
-- whose rows the policies narrow to their own) and `service_role` (trusted server code only, which
-- bypasses RLS). `anon` gets nothing: the app only syncs once an account is signed in, so a
-- signed-out request is refused outright.
revoke all on public.profiles, public.ledgers, public.budgets from anon, authenticated, service_role;

grant select, insert, update, delete on public.profiles to authenticated, service_role;
grant select, insert, update, delete on public.ledgers to authenticated, service_role;
grant select, insert, update, delete on public.budgets to authenticated, service_role;
