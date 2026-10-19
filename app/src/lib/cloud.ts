/**
 * The cloud half of the ledger: `localStorage` stays the truth the screens read, and Postgres
 * gets a copy of every change.
 *
 * That direction is deliberate. This is an installed app on a phone, opened in a lift, on a
 * train, on a flight — so the read must never wait for a network, and the write must never be
 * lost because one was not there. The screens read `lib/ledger.ts` exactly as they always did;
 * this module hangs a *sink* off it, so an append, a delete or a clear also lands in a queue
 * that is retried until Postgres accepts it.
 *
 * **What the two sides say to each other.**
 *
 * - `attach(userId)` — called when a session appears: the device switches to that account's
 *   cache (a key of its own, so two accounts on one phone cannot see each other), the sink is
 *   wired, and the account's rows are pulled down over the cache. The balances and budgets are
 *   per ledger too (`lib/balances.ts`, `lib/budget.ts`), so they switch with it.
 * - `detach()` — signed out: the sink is removed and the device's own ledger comes back.
 * - `adoptDeviceSettings(userId, name)` — the owner's first sign-in on this device hands their
 *   account the device's balances and budgets, exactly as `claimDeviceLedger` hands it the
 *   rows. Another account starts at zero and at the app's default budgets.
 * - `hydrate()` — pull rows and budgets, then replace the cache. Pending writes are applied
 *   **on top** of what came back, because a row typed while offline is newer than the row the
 *   server has for it.
 *
 * **The queue is per account** (`trackit-cloud-queue:<uuid>`) and survives a reload. It holds
 * operations rather than the whole ledger: an upsert is keyed by the app's own row id, so ten
 * edits to one row collapse into one push, and a delete removes that id's pending upsert.
 * Anything the server refuses stays queued, so a policy that gets in the way costs a retry
 * rather than the row.
 *
 * **The money crosses this boundary once.** Rows are integer paise everywhere in the app and
 * `numeric(12,2)` rupees in the table, so the only two conversions in the app live in this
 * file: `amount` out, `Math.round(amount * 100)` back. `lib/format.ts` still owns what a
 * rupee looks like.
 */

import { ACCOUNTS, DEFAULT_ACCOUNT, accountFor } from "./accounts"
import { adoptDeviceBalances, setBalancesOwner } from "./balances"
import { adoptDeviceBudgets, setBudgetOwner } from "./budget"
import { CATEGORY_GROUPS, DEFAULT_CATEGORY, categoryFor, categoryIdForLabel } from "./categories"
import { ledgerSnapshot, replaceLedger, setLedgerSink, setLedgerOwner } from "./ledger"
import { OWNER_NAME } from "./owner"
import { getSupabase } from "./supabase"
import type { Budget, Kind, Row } from "./types"

/** One row of `public.ledgers`, as PostgREST hands it back. */
type LedgerRecord = {
  id: string
  user_id: string
  created_at: string
  amount: number | string
  account_type: string
  description: string
  category: string
  sub_category: string | null
  kind: Kind
  note: string | null
  source: string | null
  occurred_at: string
  client_id: string
}

/** One row of `public.budgets`. */
type BudgetRecord = {
  id: string
  user_id: string
  client_id: string
  name: string
  limit_amount: number | string
  category_ids: string[]
  start_date: string
}

/** What a push writes. `user_id` is filled in at the call site, never by the caller. */
type LedgerInsert = Omit<LedgerRecord, "id" | "created_at" | "user_id"> & { user_id: string }
type BudgetInsert = Omit<BudgetRecord, "id" | "user_id"> & { user_id: string }

/** One queued write. Ids are the app's own, so a replay cannot duplicate a row. */
type Operation =
  | { op: "upsert"; rows: Row[]; budgets: Budget[] }
  | { op: "remove"; id: string }
  | { op: "clear" }

const QUEUE_PREFIX = "trackit-cloud-queue"
const CLAIM_PREFIX = "trackit-claim"
const SNAPSHOT_LIMIT = 5000

/** The account this device is currently mirroring, or `null` for the device's own ledger. */
let owner: string | null = null
/** Set while a flush is in flight, so a second change cannot start a parallel one. */
let flushing = false
/** Set by a failed pull (offline, a 500): the next attach or `online` retries it. */
let stale = true
/**
 * The ledger this device had the moment it was pointed at an account, captured before
 * `lib/ledger.ts` switches to the account's own key.
 *
 * It is kept for one thing: an account whose cloud shelf is empty can be handed it
 * (`claimDeviceLedger`). After that the account's own cache is the only ledger read, and
 * signing out does not take the copy away from the device.
 */
let deviceLedger: { rows: Row[]; budgets: Budget[] } | null = null
/** Resolves once the account has been pulled and its queue pushed. */
let attached: Promise<void> = Promise.resolve()
/** Whoever is drawing the sync state — the sign-out panel asks what is still waiting. */
const syncListeners = new Set<() => void>()

const queueKey = (userId: string) => `${QUEUE_PREFIX}:${userId}`

/** The account's pending writes, oldest last. A corrupt value is an empty queue, not a crash. */
function readQueue(userId: string): Operation[] {
  try {
    const raw = window.localStorage.getItem(queueKey(userId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Operation[]) : []
  } catch {
    return []
  }
}

function writeQueue(userId: string, queue: Operation[]): void {
  try {
    if (queue.length === 0) window.localStorage.removeItem(queueKey(userId))
    else window.localStorage.setItem(queueKey(userId), JSON.stringify(queue))
  } catch {
    /* A refused write costs a retry, not the row: it is already in the ledger. */
  }
}

/**
 * Add one operation to the account's queue.
 *
 * An upsert for a row that is already queued replaces the older copy — the last edit is the one
 * worth sending — and a remove drops any pending upsert for the same id, so a row deleted while
 * offline cannot be resurrected by a replay that was sitting in front of it.
 */
function enqueue(userId: string, next: Operation): void {
  const queue = readQueue(userId)
  if (next.op === "upsert") {
    const ids = new Set(next.rows.map((row) => row.id))
    const budgetIds = new Set(next.budgets.map((budget) => budget.id))
    const kept = queue.filter((entry) => {
      if (entry.op !== "upsert") return true
      return !(
        entry.rows.some((row) => ids.has(row.id)) ||
        entry.budgets.some((budget) => budgetIds.has(budget.id))
      )
    })
    kept.push(next)
    writeQueue(userId, kept)
    return
  }
  if (next.op === "remove") {
    const kept = queue.filter(
      (entry) => !(entry.op === "upsert" && entry.rows.some((row) => row.id === next.id)),
    )
    kept.push(next)
    writeQueue(userId, kept)
    return
  }
  // A clear makes everything before it pointless: nothing older can outlive it on the server.
  writeQueue(userId, [next])
}

/**
 * The app's row as the table's row.
 *
 * `category` is the **parent** group's label and `sub_category` the leaf's own, which is exactly
 * the two-level shape the app files under (`lib/categories.ts`): a row keeps a category id, and
 * the id knows both. A row filed under an id the table has never heard of keeps its own label
 * rather than being silently re-filed.
 */
function toRecord(row: Row, userId: string): LedgerInsert {
  const category = categoryFor(row.category)
  const known = CATEGORY_GROUPS.some((group) => group.categories.includes(row.category))
  return {
    user_id: userId,
    client_id: row.id,
    amount: row.amountCents / 100,
    account_type: accountFor(row.account).name,
    description: row.title,
    category: known ? groupLabelOf(category.group) : "",
    sub_category: known ? category.label : row.category,
    kind: row.kind,
    note: row.note ?? null,
    source: row.source ?? null,
    occurred_at: new Date(row.at).toISOString(),
  }
}

function groupLabelOf(group: string): string {
  return CATEGORY_GROUPS.find((candidate) => candidate.id === group)?.label ?? group
}

/** The table's row as the app's row. Unknown labels land on the default envelope. */
function fromRecord(record: LedgerRecord): Row {
  const category =
    (record.sub_category ? categoryIdForLabel(record.sub_category) : undefined) ??
    (record.category ? categoryIdForLabel(record.category) : undefined) ??
    DEFAULT_CATEGORY
  const account =
    ACCOUNTS.find((candidate) => candidate.name === record.account_type)?.id ?? DEFAULT_ACCOUNT
  return {
    id: record.client_id,
    title: record.description || categoryFor(category).label,
    category,
    account,
    amountCents: Math.round(Number(record.amount) * 100),
    kind: record.kind,
    at: new Date(record.occurred_at).getTime(),
    ...(record.note ? { note: record.note } : {}),
    ...(record.source === "manual" || record.source === "shortcut" || record.source === "upi"
      ? { source: record.source }
      : {}),
  }
}

function budgetRecord(budget: Budget, userId: string): BudgetInsert {
  return {
    user_id: userId,
    client_id: budget.id,
    name: budget.name,
    limit_amount: budget.limitCents / 100,
    category_ids: budget.categoryIds,
    start_date: new Date(budget.startDate).toISOString(),
  }
}

function budgetFromRecord(record: BudgetRecord): Budget {
  return {
    id: record.client_id,
    name: record.name,
    limitCents: Math.round(Number(record.limit_amount) * 100),
    categoryIds: record.category_ids ?? [],
    startDate: new Date(record.start_date).getTime(),
  }
}

/**
 * Push the queue, oldest first, stopping at the first refusal.
 *
 * Stopping rather than pressing on is the whole reason the queue exists: a row the server
 * refuses (offline, a 500, a policy that has not been applied yet) must not cost the rows queued
 * behind it their place in line. `clear` is server-side (`delete` with no id filter), which is
 * the only way to be sure a device-side clear removes every row the account owns.
 */
export async function flush(): Promise<void> {
  const client = getSupabase()
  const userId = owner
  if (!client || !userId || flushing) return
  flushing = true
  try {
    let queue = readQueue(userId)
    while (queue.length > 0) {
      const entry = queue[0]
      if (entry.op === "upsert") {
        if (entry.rows.length > 0) {
          const { error } = await client
            .from("ledgers")
            .upsert(entry.rows.map((row) => toRecord(row, userId)), {
              onConflict: "user_id,client_id",
            })
          if (error) return
        }
        if (entry.budgets.length > 0) {
          const { error } = await client
            .from("budgets")
            .upsert(entry.budgets.map((budget) => budgetRecord(budget, userId)), {
              onConflict: "user_id,client_id",
            })
          if (error) return
        }
      } else if (entry.op === "remove") {
        const { error } = await client
          .from("ledgers")
          .delete()
          .eq("user_id", userId)
          .eq("client_id", entry.id)
        if (error) return
      } else {
        const { error } = await client.from("ledgers").delete().eq("user_id", userId)
        if (error) return
        const budgets = await client.from("budgets").delete().eq("user_id", userId)
        if (budgets.error) return
      }
      queue = queue.slice(1)
      writeQueue(userId, queue)
    }
  } finally {
    flushing = false
    announce()
  }
}

/**
 * Pull the account's ledger into the device cache.
 *
 * Pending writes are laid over the answer rather than dropped: a row typed on a train is newer
 * than whatever the server last heard, and a hydrate that overwrote it would lose the one thing
 * offline-first is for. The merge is by id, so no row can appear twice.
 */
export async function hydrate(): Promise<void> {
  const client = getSupabase()
  const userId = owner
  if (!client || !userId) return

  const [rowsResult, budgetsResult] = await Promise.all([
    client
      .from("ledgers")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(SNAPSHOT_LIMIT),
    client.from("budgets").select("*"),
  ])
  if (rowsResult.error || budgetsResult.error) {
    stale = true
    return
  }
  stale = false

  const rows = (rowsResult.data as LedgerRecord[]).map(fromRecord)
  const budgets = (budgetsResult.data as BudgetRecord[]).map(budgetFromRecord)

  const queued = readQueue(userId)
  const pendingRows = new Map<string, Row>()
  const pendingBudgets = new Map<string, Budget>()
  const removed = new Set<string>()
  for (const entry of queued) {
    if (entry.op === "upsert") {
      for (const row of entry.rows) pendingRows.set(row.id, row)
      for (const budget of entry.budgets) pendingBudgets.set(budget.id, budget)
    } else if (entry.op === "remove") {
      removed.add(entry.id)
    }
  }

  const merged = [...pendingRows.values(), ...rows.filter((row) => !removed.has(row.id))]
  replaceLedger({
    rows: merged,
    budgets: [...pendingBudgets.values(), ...budgets],
  })
  announce()
}

/**
 * Point this device at an account: its own cache, its own queue, its rows.
 *
 * The cache key carries the account id (`lib/ledger.ts`), so signing in as somebody else on the
 * same phone shows their ledger and never the last one's, and signing out returns the device's
 * own.
 */
export function attach(userId: string): void {
  if (owner === userId) return
  // **Before** the switch: this is the last moment the device's own ledger is the one
  // `ledgerSnapshot()` reads, and it is what `claimDeviceLedger` can hand to an empty
  // account.
  if (owner === null) deviceLedger = ledgerSnapshot()
  owner = userId
  setLedgerOwner(userId)
  setBalancesOwner(userId)
  setBudgetOwner(userId)
  setLedgerSink({
    upsert(rows, budgets) {
      enqueue(userId, { op: "upsert", rows, budgets })
      void flush()
    },
    remove(id) {
      enqueue(userId, { op: "remove", id })
      void flush()
    },
    clear() {
      enqueue(userId, { op: "clear" })
      void flush()
    },
  })
  window.addEventListener("online", onOnline)
  attached = (async () => {
    await hydrate()
    await flush()
  })()
  announce()
}

/** Signed out: stop mirroring, and hand the device its own ledger back. */
export function detach(): void {
  if (owner === null) return
  owner = null
  deviceLedger = null
  setLedgerSink(null)
  setLedgerOwner(null)
  setBalancesOwner(null)
  setBudgetOwner(null)
  window.removeEventListener("online", onOnline)
  announce()
}

/**
 * Hand this device's ledger to an account that has none.
 *
 * The vault's history predates the vault: it is the Wallet sheet this app has always
 * bundled, stored in `localStorage` as the device's own ledger. The first time the account
 * **that ledger belongs to** signs in — the name the app greets (`OWNER_NAME`) — and its
 * cloud shelf turns out to be empty, the rows are moved up rather than left behind, so the
 * owner opens the app on any other device and finds their money already there.
 *
 * Four gates, and every one of them is the difference between a seeded vault and somebody
 * else's ledger appearing under a new login:
 *
 * - the **name** is the owner's, so a second account never inherits a sheet it does not own;
 * - the **cloud shelf is empty**, so a second device (or a reinstall) cannot push the
 *   bundled sheet over a ledger the owner has since edited;
 * - the **device ledger is not empty** — a device with nothing on it has nothing to give;
 * - and it happens **once per account**, remembered in `trackit-claim:<uuid>`, so clearing
 *   the vault on purpose is not undone by the next sign-in.
 *
 * The rows keep their own ids (`client_id`), so this is an upsert like any other: a claim
 * that races a queue push lands on the same rows instead of beside them.
 */
export function adoptDeviceSettings(userId: string, name: string | null): void {
  // The same gate as the claim below, and for the same reason: the device's figures are the
  // owner's own history, so only the account the app greets by `OWNER_NAME` may take them.
  if (owner !== userId || name !== OWNER_NAME) return
  adoptDeviceBalances()
  adoptDeviceBudgets()
}

export async function claimDeviceLedger(userId: string, name: string | null): Promise<boolean> {
  if (owner !== userId || name !== OWNER_NAME) return false
  if (claimed(userId)) return false
  const device = deviceLedger
  if (!device || device.rows.length === 0) return false

  const client = getSupabase()
  if (!client) return false
  await attached

  const { count, error } = await client
    .from("ledgers")
    .select("client_id", { count: "exact", head: true })
    .eq("user_id", userId)
  if (error || (count ?? 0) > 0) return false

  markClaimed(userId)
  enqueue(userId, { op: "upsert", rows: device.rows, budgets: device.budgets })

  // What is on screen already is the queue's, so the two are merged by id rather than
  // concatenated: a row typed while the claim was in flight must not appear twice.
  const current = ledgerSnapshot()
  const rows = new Map(device.rows.map((row) => [row.id, row]))
  for (const row of current.rows) rows.set(row.id, row)
  const budgets = new Map(device.budgets.map((budget) => [budget.id, budget]))
  for (const budget of current.budgets) budgets.set(budget.id, budget)
  replaceLedger({ rows: [...rows.values()], budgets: [...budgets.values()] })

  await flush()
  return true
}

function claimed(userId: string): boolean {
  try {
    return window.localStorage.getItem(`${CLAIM_PREFIX}:${userId}`) !== null
  } catch {
    return true
  }
}

function markClaimed(userId: string): void {
  try {
    window.localStorage.setItem(`${CLAIM_PREFIX}:${userId}`, new Date().toISOString())
  } catch {
    /* A refused write costs a second offer, not the rows. */
  }
}

/** Tell whoever is drawing the sync state that it has changed. */
function announce(): void {
  for (const listener of syncListeners) listener()
}

/** Watch the pending-write count. The returned function stops watching. */
export function subscribeSync(listener: () => void): () => void {
  syncListeners.add(listener)
  return () => {
    syncListeners.delete(listener)
  }
}

/**
 * Nothing on the device is lost by a signed-out session: the device ledger is still there, and
 * the account's cache is still at its own key for the next sign-in.
 */
function onOnline(): void {
  if (!owner) return
  void (async () => {
    if (stale) await hydrate()
    await flush()
  })()
}

/** How many writes are waiting for the network. The login screen and the app's footer may say. */
export function pendingWrites(): number {
  return owner ? readQueue(owner).length : 0
}

/** The rows as the cache has them — the same snapshot every screen reads. */
export function cachedSnapshot(): { rows: Row[]; budgets: Budget[] } {
  return ledgerSnapshot()
}
