/**
 * The app's two budgets: Food & Beverages, ₹1,500 a month, and all spending, ₹5,000 a month.
 *
 * They are **two different questions**, and the app draws one of each:
 *
 * - **`food`** is the dashboard's envelope card. It counts what the owner says it counts —
 *   by default the Wallet dimension `food-drinks`: the dimension's own row plus Groceries,
 *   Restaurants and Bar & Café. A taxi, a rent payment or an income row never moves it.
 * - **`total`** is the stats screen's dial. By default it counts every expense in the month,
 *   whatever its category, because that is what "what has the month cost me?" means.
 *
 * **Which categories count is the owner's choice** (`tracked`), and it is made from the card
 * that draws the figure: a long press opens the editor, which offers both the limit and the
 * categories/subcategories the budget is about. A budget that tracks nothing is a real
 * answer — the card then reads ₹0 of its limit rather than pretending to a default — and so
 * is `total` left at `null`, which means **every expense** rather than a list of them.
 *
 * Both limits are **the owner's own numbers**. The store lives here — `localStorage`, one
 * key, a cached snapshot so `useSyncExternalStore` can compare by identity, exactly like
 * `lib/ledger.ts` — and the models take the limit and the tracked set as arguments rather
 * than reading the store, so `derive.ts` and `analytics.ts` stay pure and a screen re-derives
 * only when something it was drawn with actually changes.
 *
 * **The numbers are the ledger's, not the device's.** `trackit-budgets` is the device's own
 * store and a signed-in account reads `trackit-budgets:u:<uuid>`, so a second account on the
 * same phone gets the app's defaults rather than the first account's renamed envelope. The
 * owner's own account adopts the device's copy on its first sign-in
 * (`adoptDeviceBudgets`), which is what keeps a limit set before accounts existed.
 *
 * A Wallet export's own `Budget` documents are **not** these: they still drive the per-row
 * bars on the ledger (`lib/derive.ts`), which is a different question — what one row's
 * category has used up.
 */

import { CATEGORY_GROUPS, categoryFor } from "./categories"
import type { Row } from "./types"

/** Which of the two budgets a figure or an edit is about. */
export type BudgetScope = "food" | "total"

export const BUDGET_SCOPES: readonly BudgetScope[] = ["food", "total"]

/** The Wallet dimension the food budget is about by default: every F&B category is painted this group. */
export const BUDGET_GROUP = "food-drinks"

/** What each budget allows in one month, in integer paise, before the owner changes it. */
export const BUDGET_DEFAULTS: Record<BudgetScope, number> = {
  food: 150_000, // ₹1,500
  total: 500_000, // ₹5,000
}

/** Every limit the app holds, in integer paise. */
export type BudgetLimits = Record<BudgetScope, number>

/**
 * What each budget counts: category ids, or `null` for **every expense**.
 *
 * `null` is only ever the total budget's default. An empty array is a different statement —
 * "this budget tracks nothing" — and the two must not collapse into one another, which is
 * why this is `string[] | null` rather than a list that might happen to be empty.
 */
export type BudgetTracked = Record<BudgetScope, string[] | null>

/** The Food & Beverages group's own id plus its three subcategories. */
const FOOD_CATEGORIES: string[] =
  CATEGORY_GROUPS.find((group) => group.id === BUDGET_GROUP)?.categories ?? [BUDGET_GROUP]

export const BUDGET_TRACKED_DEFAULTS: BudgetTracked = {
  food: [...FOOD_CATEGORIES],
  total: null,
}

/** Everything the store holds, in one object so a snapshot can be compared by identity. */
export type BudgetState = {
  limits: BudgetLimits
  tracked: BudgetTracked
  names: BudgetNames
}

/**
 * What the two cards call their budgets, and what the editor says above the keypad.
 *
 * `label` is the short name the card itself prints; `title` is the editor's heading;
 * `blurb` is the one line explaining what counts, because two budgets with different
 * scopes can otherwise only be told apart by their figure.
 */
export const BUDGET_COPY: Record<
  BudgetScope,
  { label: string; title: string; blurb: string }
> = {
  food: {
    label: "F&B Budget",
    title: "Food & Beverages budget",
    blurb: "Groceries, restaurants, bars and cafés — nothing else counts against it.",
  },
  total: {
    label: "Total Budget",
    title: "Total spending budget",
    blurb: "Every expense this month, whatever its category.",
  },
}

/**
 * What each budget's card calls itself, once the owner has named it.
 *
 * **The envelope's name is theirs.** "F&B Budget" is what the app calls it before anybody
 * says otherwise — it is the dimension's own label — and the card is where it is renamed,
 * because the card is where the name is read. It lives in this store rather than on the
 * row data: a name is not a transaction, and it has to survive a reload the same way the
 * limit does.
 */
export type BudgetNames = Record<BudgetScope, string>

/** The names the cards wear before the owner changes them. */
export const BUDGET_NAME_DEFAULTS: BudgetNames = {
  food: BUDGET_COPY.food.label,
  total: BUDGET_COPY.total.label,
}

/**
 * How long a name may be. A card is 390px wide and its title sits on one line beside a
 * gauge, so a name that ran on would be truncated by the layout rather than by this — and a
 * truncated name is the app deciding what the owner meant. It is short enough to fit, long
 * enough for `Food & Beverages`.
 */
export const BUDGET_NAME_MAX = 28

/**
 * A name as it is kept: single-line, no surrounding space, and never empty.
 *
 * An empty field is not a name — it is the owner having cleared it, and what they then see
 * is the app's own label again rather than a blank card with no way to tell what it counts.
 * The trim happens here rather than on every keystroke: stripping a space as it is typed
 * would make "F&B Budget" impossible to write.
 */
export function budgetNameFrom(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback
  const clean = value.replace(/\s+/g, " ").trim().slice(0, BUDGET_NAME_MAX)
  return clean.length > 0 ? clean : fallback
}

/** Whether money filed under this category is the food budget's business by default. */
export function isBudgetCategory(categoryId: string): boolean {
  return categoryFor(categoryId).group === BUDGET_GROUP
}

/**
 * What a budget has seen in a window, in paise: expenses only, half-open `[from, to)` like
 * every other window in the app.
 *
 * `categories === null` counts every expense; an array counts only the rows filed under one
 * of its ids, and an empty array counts nothing at all.
 */
export function budgetSpent(
  rows: Row[],
  from: number,
  to: number,
  categories: string[] | null,
): number {
  let total = 0
  for (const row of rows) {
    if (row.kind !== "expense") continue
    if (row.at < from || row.at >= to) continue
    if (categories !== null && !categories.includes(row.category)) continue
    total += row.amountCents
  }
  return total
}

/** What a tracked id is called on a chip: the leaf's own name. */
export function trackedName(categoryId: string): string {
  return categoryFor(categoryId).label
}

/* ------------------------------------------------------------------ *
 * The store
 *
 * One small object, one key, and the same shape as the ledger's store: a cached snapshot
 * (so `useSyncExternalStore` sees the same object until something is written), listeners,
 * and best-effort storage. A browser that refuses storage costs the owner a remembered
 * limit, never the card they are looking at.
 * ------------------------------------------------------------------ */

const STORAGE_KEY = "trackit-budgets"

/** The snapshot a store-less browser has. A shared constant, because identity is compared. */
const FALLBACK: BudgetState = {
  limits: { ...BUDGET_DEFAULTS },
  tracked: { food: [...FOOD_CATEGORIES], total: null },
  names: { ...BUDGET_NAME_DEFAULTS },
}

/**
 * Whose budgets these are: `null` for the device's own ledger, an account id once signed in.
 *
 * Defaults are the same for both — they are the app's numbers, not anybody's history — but the
 * *store* is separate so one account's renamed envelope and chosen categories never appear
 * under another login.
 */
let owner: string | null = null

/** The device's budgets, captured on the way into an account so the owner's can adopt them. */
let carried: BudgetState | null = null

const storageKey = (): string => (owner === null ? STORAGE_KEY : `${STORAGE_KEY}:u:${owner}`)

let cache: BudgetState | null = null

const listeners = new Set<() => void>()

const announce = (): void => {
  for (const listener of listeners) listener()
}

/** A stored limit is kept only if it is a positive whole number of paise. */
function limitFrom(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback
}

/** A stored tracked set: ids only, deduplicated; `undefined` falls back to the default. */
function trackedFrom(value: unknown, fallback: string[] | null): string[] | null {
  if (value === null) return null
  if (!Array.isArray(value)) return fallback
  const ids = value.filter((id): id is string => typeof id === "string")
  return [...new Set(ids)]
}

function read(): BudgetState {
  try {
    const raw = window.localStorage.getItem(storageKey())
    if (!raw) return FALLBACK
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return FALLBACK
    const store = parsed as Record<string, unknown>
    /*
     * A ledger written before this shape existed holds the two limits at the top level and
     * knows nothing about categories (`{ food: 150000, total: 500000 }`). Reading both
     * spellings is the whole migration: the first save writes the new shape, and a budget
     * whose categories were never chosen is exactly the default set.
     */
    const limits = store.limits as Record<string, unknown> | undefined
    const tracked = store.tracked as Record<string, unknown> | undefined
    // A store written before names existed simply holds none: each falls back to the label
    // the card has always worn.
    const names = store.names as Record<string, unknown> | undefined
    return {
      limits: {
        food: limitFrom(limits?.food ?? store.food, BUDGET_DEFAULTS.food),
        total: limitFrom(limits?.total ?? store.total, BUDGET_DEFAULTS.total),
      },
      tracked: {
        food: trackedFrom(tracked?.food, BUDGET_TRACKED_DEFAULTS.food),
        total: trackedFrom(tracked?.total, BUDGET_TRACKED_DEFAULTS.total),
      },
      names: {
        food: budgetNameFrom(names?.food, BUDGET_NAME_DEFAULTS.food),
        total: budgetNameFrom(names?.total, BUDGET_NAME_DEFAULTS.total),
      },
    }
  } catch {
    return FALLBACK
  }
}

/** Both limits and both tracked sets, handed back by reference until something changes. */
export function budgetSnapshot(): BudgetState {
  if (cache === null) cache = read()
  return cache
}

/** Write the store and tell every card that draws it. */
function commit(next: BudgetState): void {
  cache = next
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(next))
  } catch {
    // The new value still holds for this session; only remembering it was refused.
  }
  announce()
}

/**
 * Point the store at an account's own budgets, or back at the device's.
 *
 * The device's snapshot is kept on the way out of it (`adoptDeviceBudgets`); the cache is
 * dropped so the next `budgetSnapshot()` reads the new key and every card is told to look again.
 */
export function setBudgetOwner(userId: string | null): void {
  if (owner === userId) return
  if (owner === null) carried = budgetSnapshot()
  if (userId === null) carried = null
  owner = userId
  cache = null
  announce()
}

/**
 * Hand the device's budgets to the account that has just signed in — the owner's, once.
 *
 * The caller is the same one that decides the ledger claim (`lib/cloud.ts`), so a second
 * account is never handed an envelope somebody else named. An account that already has a stored
 * budget keeps it; this only fills an empty one.
 */
export function adoptDeviceBudgets(): void {
  if (owner === null || carried === null) return
  try {
    if (window.localStorage.getItem(storageKey()) !== null) return
  } catch {
    // A store that cannot be read cannot be written safely either; the defaults stand.
    return
  }
  cache = carried
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(carried))
  } catch {
    // This session still draws the adopted budgets; only remembering them was refused.
  }
  announce()
}

/** Set one limit, in paise, and tell every card that draws it. */
export function setBudgetLimit(scope: BudgetScope, cents: number): void {
  const current = budgetSnapshot()
  commit({
    limits: { ...current.limits, [scope]: limitFrom(cents, BUDGET_DEFAULTS[scope]) },
    tracked: current.tracked,
    names: current.names,
  })
}

/**
 * Rename a budget, and tell every card that prints the name.
 *
 * It is called when the field **loses focus** rather than on every keystroke: a name is
 * written as it is typed, and trimming each keystroke would eat the spaces in the middle of
 * one ("F&B Budget" would arrive as "F&BBudget"). Clearing the field restores the app's own
 * label — see `budgetNameFrom`.
 */
export function setBudgetName(scope: BudgetScope, name: string): void {
  const current = budgetSnapshot()
  commit({
    limits: current.limits,
    tracked: current.tracked,
    names: { ...current.names, [scope]: budgetNameFrom(name, BUDGET_NAME_DEFAULTS[scope]) },
  })
}

/**
 * Set what a budget counts, and tell every card that draws it.
 *
 * It is called on **every toggle** rather than on a save button, because the card behind the
 * panel is the answer to "what does this do?" — the gauge moves while the panel is open,
 * which is a far better explanation than a caption under a list.
 */
export function setBudgetTracked(scope: BudgetScope, categories: string[] | null): void {
  const current = budgetSnapshot()
  commit({
    limits: current.limits,
    tracked: {
      ...current.tracked,
      [scope]: categories === null ? null : [...new Set(categories)],
    },
    names: current.names,
  })
}

/** Watch the store. The returned function stops watching. */
export function subscribeBudgets(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
