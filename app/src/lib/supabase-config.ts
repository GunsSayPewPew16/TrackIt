/**
 * The public half of the cloud, committed as the default.
 *
 * These two values are **not secrets**. The publishable key is designed to travel inside the
 * bundle — it already does, in every built asset — and the only thing standing between one
 * account's money and another's is the row-level security in `supabase/schema.sql`. The service
 * role key must never appear here.
 *
 * They are the default so that a deployment is the online app **with no dashboard step at all**:
 * the Vercel build (`app/vercel.json`) reads no environment, the Pages build reads its Actions
 * variables, and a local `app/.env.local` reads its own file. When those are set they win — see
 * `lib/supabase.ts` — so a staging project can point somewhere else without editing this file,
 * and `VITE_CLOUD=off` still forces the device-only app (`npm run check:flows` uses it).
 */
export const DEFAULT_SUPABASE_URL = "https://tqlxdewhvsvkkoilgbpe.supabase.co"
export const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_qJQWe3CZme50cjlSFrpqAg_Jss0smrx"
