/**
 * The budgets: a carousel of **envelopes** on the dashboard, and all spending on the stats dial.
 *
 * They are two different questions, and the app draws one of each:
 *
 * - **Envelopes** are the dashboard's cards. The first one is Food & Beverages, ₹1,500 a
 *   month, counting the Wallet dimension `food-drinks`: the dimension's own row plus
 *   Groceries, Restaurants and Bar & Café. A taxi, a rent payment or an income row never
 *   moves it. The owner can create more of them from that card's hold, and each one is a
 *   budget of its own — its own name, limit and set of categories.
 * - **`total`** is the stats screen's dial. By default it counts every expense in the month,
 *   whatever its category, because that is what "what has the month cost me?" means. It is
 *   deliberately not an envelope: the dial is a different screen asking a different question.
 *
 * **Which categories count is the owner's choice** (`tracked`), and it is made from the card
 * that draws the figure: a long press opens the editor, which offers both the limit and the
 * categories/subcategories the budget is about. A budget that tracks nothing is a real
 * answer — the card then reads ₹0 of its limit rather than pretending to a default — and so
 * is `total` left at `null`, which means **every expense** rather than a list of them.
 *
 * Every limit is **the owner's own number**. The store lives here — `localStorage`, one key,
 * a cached snapshot so `useSyncExternalStore` can compare by identity, exactly like
 * `lib/ledger.ts` — and the models take an envelope's limit and tracked set as arguments
 * rather than reading the store, so `derive.ts` and `analytics.ts` stay pure and a screen
 * re-derives only when something it was drawn with actually changes.
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

/** The Wallet dimension the first envelope is about by default: every F&B category is painted this group. */
export const BUDGET_GROUP = "food-drinks"

/** What an envelope allows in one month, and what the stats dial allows, in integer paise. */
export const BUDGET_DEFAULTS = {
  /** ₹1,500 — the first envelope's limit, and a new envelope's starting figure. */
  envelope: 150_000,
  /** ₹5,000 — the stats dial. */
  total: 500_000,
}

/**
 * What a budget counts: category ids, or `null` for **every expense**.
 *
 * `null` is only ever the total dial's default. An empty array is a different statement —
 * "this budget tracks nothing" — and the two must not collapse into one another, which is
 * why this is `string[] | null` rather than a list that might happen to be empty.
 */
export type BudgetTracked = string[] | null

/** The Food & Beverages group's own id plus its three subcategories. */
const FOOD_CATEGORIES: string[] =
  CATEGORY_GROUPS.find((group) => group.id === BUDGET_GROUP)?.categories ?? [BUDGET_GROUP]

export const BUDGET_TRACKED_DEFAULTS: Record<"envelope" | "total", BudgetTracked> = {
  envelope: [...FOOD_CATEGORIES],
  total: null,
}

/**
 * One budget card on the dashboard.
 *
 * `id` is what the carousel keys a card by and what an edit is addressed to. The first
 * envelope keeps the legacy `"food"` id, so a store written before the carousel existed is
 * read as that card rather than as a new one.
 */
export type Envelope = {
  id: string
  name: string
  /** What it allows in one month, in integer paise. */
  limitCents: number
  /** The category ids it counts, or `null` for every expense. */
  tracked: BudgetTracked
}

/** Everything the store holds, in one object so a snapshot can be compared by identity. */
export type BudgetState = {
  /** The dashboard's envelopes, in the order the carousel draws them. Never empty. */
  envelopes: Envelope[]
  /** The stats dial's own budget, which is not one of the carousel's cards. */
  total: {
    name: string
    limitCents: number
    tracked: BudgetTracked
  }
  /**
   * The envelope the carousel was last on. It is kept with the budgets rather than in the
   * screen because the owner should find their cards where they left them after a reload —
   * and because a signed-in account's cards are already separated by this store's key.
   */
  activeId: string
}

/** The short name, heading and one-line explanation a budget's editor uses. */
export type BudgetCopy = { label: string; title: string; blurb: string }

/**
 * What the editor says for each kind of budget.
 *
 * An envelope's own copy is built from its name (see `envelopeCopy`), because the name is
 * the owner's; this is the fallback the app has always used, and the stats dial's own words.
 */
export const BUDGET_COPY: Record<"envelope" | "total", BudgetCopy> = {
  envelope: {
    label: "F&B Budget",
    title: "Food & Beverages budget",
    blurb: "Only rows filed under the categories you choose count against this envelope.",
  },
  total: {
    label: "Total Budget",
    title: "Total spending budget",
    blurb: "Every expense this month, whatever its category.",
  },
}

/** What the first envelope and the stats dial wear before the owner renames them. */
export const BUDGET_NAME_DEFAULTS = {
  envelope: BUDGET_COPY.envelope.label,
  total: BUDGET_COPY.total.label,
}

/** The name, limit and tracked set a newly created envelope starts on. */
export const NEW_ENVELOPE = {
  name: "New budget",
  limitCents: BUDGET_DEFAULTS.envelope,
  /** Nothing yet: the card reads ₹0 of its limit until the owner chooses what counts. */
  tracked: [] as string[],
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

/** Whether money filed under this category is the first envelope's business by default. */
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
  categories: BudgetTracked,
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

/** The editor's heading and blurb for one envelope, which the owner may have renamed. */
export function envelopeCopy(envelope: Envelope): BudgetCopy {
  return {
    label: envelope.name,
    title: envelope.name,
    blurb: BUDGET_COPY.envelope.blurb,
  }
}

/** The app's first envelope: the one a fresh store holds, before any carousel. */
export function defaultEnvelopes(): Envelope[] {
  return [
    {
      id: "food",
      name: BUDGET_NAME_DEFAULTS.envelope,
      limitCents: BUDGET_DEFAULTS.envelope,
      tracked: [...FOOD_CATEGORIES],
    },
  ]
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
  envelopes: defaultEnvelopes(),
  total: {
    name: BUDGET_NAME_DEFAULTS.total,
    limitCents: BUDGET_DEFAULTS.total,
    tracked: BUDGET_TRACKED_DEFAULTS.total,
  },
  activeId: "food",
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
function trackedFrom(value: unknown, fallback: BudgetTracked): BudgetTracked {
  if (value === null) return null
  if (!Array.isArray(value)) return fallback
  const ids = value.filter((id): id is string => typeof id === "string")
  return [...new Set(ids)]
}

/**
 * The name an envelope falls back to: the app's own label for the legacy food card, and
 * *New budget* for one the owner added. A cleared field restores the one it started on.
 */
function envelopeNameFallback(id: string): string {
  return id === "food" ? BUDGET_NAME_DEFAULTS.envelope : NEW_ENVELOPE.name
}

/** One envelope from an unknown stored value, or `null` when it has no usable id. */
function envelopeFrom(value: unknown): Envelope | null {
  if (typeof value !== "object" || value === null) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== "string" || raw.id.length === 0) return null
  return {
    id: raw.id,
    name: budgetNameFrom(raw.name, envelopeNameFallback(raw.id)),
    limitCents: limitFrom(raw.limitCents, BUDGET_DEFAULTS.envelope),
    tracked: trackedFrom(raw.tracked, NEW_ENVELOPE.tracked),
  }
}

/** The stats dial's budget from an unknown stored value, filling in the app's defaults. */
function totalFrom(value: unknown): BudgetState["total"] {
  const total = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
  return {
    name: budgetNameFrom(total.name, BUDGET_NAME_DEFAULTS.total),
    limitCents: limitFrom(total.limitCents, BUDGET_DEFAULTS.total),
    tracked: trackedFrom(total.tracked, BUDGET_TRACKED_DEFAULTS.total),
  }
}

function read(): BudgetState {
  try {
    const raw = window.localStorage.getItem(storageKey())
    if (!raw) return FALLBACK
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return FALLBACK
    const store = parsed as Record<string, unknown>

    /*
     * The carousel's store is `{ envelopes: [...], total: {...} }`. A store written before
     * it existed holds two fixed scopes (`limits.food`, `tracked.food`, `names.food`), and
     * one older still holds the two limits at the top level (`{ food, total }`). Reading
     * every spelling is the whole migration: the first save writes the new shape, the old
     * food budget becomes the first envelope, and a budget whose categories were never
     * chosen is exactly the default set.
     */
    if (Array.isArray(store.envelopes)) {
      const seen = new Set<string>()
      const envelopes: Envelope[] = []
      for (const value of store.envelopes) {
        const envelope = envelopeFrom(value)
        if (envelope === null || seen.has(envelope.id)) continue
        seen.add(envelope.id)
        envelopes.push(envelope)
      }
      const list = envelopes.length > 0 ? envelopes : defaultEnvelopes()
      // A stored card that has since been deleted reopens on the first one rather than on
      // a position that no longer exists.
      const storedActive = typeof store.activeId === "string" ? store.activeId : ""
      return {
        envelopes: list,
        total: totalFrom(store.total),
        activeId: list.some((envelope) => envelope.id === storedActive)
          ? storedActive
          : (list[0]?.id ?? "food"),
      }
    }

    const limits = store.limits as Record<string, unknown> | undefined
    const tracked = store.tracked as Record<string, unknown> | undefined
    // A store written before names existed simply holds none: each falls back to the label
    // the card has always worn.
    const names = store.names as Record<string, unknown> | undefined
    return {
      envelopes: [
        {
          id: "food",
          name: budgetNameFrom(names?.food, BUDGET_NAME_DEFAULTS.envelope),
          limitCents: limitFrom(limits?.food ?? store.food, BUDGET_DEFAULTS.envelope),
          tracked: trackedFrom(tracked?.food, BUDGET_TRACKED_DEFAULTS.envelope),
        },
      ],
      total: {
        name: budgetNameFrom(names?.total, BUDGET_NAME_DEFAULTS.total),
        limitCents: limitFrom(limits?.total ?? store.total, BUDGET_DEFAULTS.total),
        tracked: trackedFrom(tracked?.total, BUDGET_TRACKED_DEFAULTS.total),
      },
      activeId: "food",
    }
  } catch {
    return FALLBACK
  }
}

/** Every envelope and the dial's budget, handed back by reference until something changes. */
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

/** Replace one envelope's fields, and tell every card that draws it. */
function updateEnvelope(id: string, change: (envelope: Envelope) => Envelope): void {
  const current = budgetSnapshot()
  commit({
    envelopes: current.envelopes.map((envelope) => (envelope.id === id ? change(envelope) : envelope)),
    total: current.total,
    activeId: current.activeId,
  })
}

/**
 * Add an envelope and return its id, so the caller can open its editor.
 *
 * It starts blank — the app's ₹1,500 limit and no categories — rather than copying the card
 * it was made from. A copy would draw the same figure twice and leave the owner to work out
 * which one to change; an empty card reads as the new one and its editor is already opening.
 */
export function addEnvelope(): string {
  const current = budgetSnapshot()
  const id = `envelope-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  commit({
    envelopes: [
      ...current.envelopes,
      {
        id,
        name: NEW_ENVELOPE.name,
        limitCents: NEW_ENVELOPE.limitCents,
        tracked: [...NEW_ENVELOPE.tracked],
      },
    ],
    total: current.total,
    // The carousel follows the card that was just made, and so does the next open.
    activeId: id,
  })
  return id
}

/**
 * Remember which envelope the carousel is on. Called as the cards snap, not on every pixel
 * of a drag; the card id is checked against the store so a stale write cannot hide them all.
 */
export function setActiveEnvelope(id: string): void {
  const current = budgetSnapshot()
  if (current.activeId === id) return
  if (!current.envelopes.some((envelope) => envelope.id === id)) return
  commit({ ...current, activeId: id })
}

/**
 * Move one envelope one place earlier or later in the carousel. The active card stays the
 * active one — it has only changed places — and the screen scrolls to its new home.
 */
export function moveEnvelope(id: string, direction: -1 | 1): boolean {
  const current = budgetSnapshot()
  const from = current.envelopes.findIndex((envelope) => envelope.id === id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= current.envelopes.length) return false
  const envelopes = [...current.envelopes]
  const moved = envelopes[from]
  const swapped = envelopes[to]
  if (!moved || !swapped) return false
  envelopes[from] = swapped
  envelopes[to] = moved
  commit({ envelopes, total: current.total, activeId: current.activeId })
  return true
}

/**
 * Delete one envelope. The last one cannot go: the dashboard always has a card to open, and
 * a store with no envelopes would have no way back to one from the screen. If the deleted
 * card was the active one, the card that takes its place becomes active.
 */
export function removeEnvelope(id: string): boolean {
  const current = budgetSnapshot()
  if (current.envelopes.length <= 1) return false
  const index = current.envelopes.findIndex((envelope) => envelope.id === id)
  if (index < 0) return false
  const envelopes = current.envelopes.filter((envelope) => envelope.id !== id)
  const activeId =
    current.activeId === id
      ? (envelopes[Math.min(index, envelopes.length - 1)]?.id ?? envelopes[0]?.id ?? "food")
      : current.activeId
  commit({ envelopes, total: current.total, activeId })
  return true
}

/** Set one envelope's limit, in paise, and tell every card that draws it. */
export function setEnvelopeLimit(id: string, cents: number): void {
  updateEnvelope(id, (envelope) => ({
    ...envelope,
    limitCents: limitFrom(cents, BUDGET_DEFAULTS.envelope),
  }))
}

/**
 * Rename one envelope, and tell every card that prints the name.
 *
 * It is called when the field **loses focus** rather than on every keystroke: a name is
 * written as it is typed, and trimming each keystroke would eat the spaces in the middle of
 * one ("F&B Budget" would arrive as "F&BBudget"). Clearing the field restores the app's own
 * label — see `budgetNameFrom`.
 */
export function setEnvelopeName(id: string, name: string): void {
  updateEnvelope(id, (envelope) => ({
    ...envelope,
    name: budgetNameFrom(name, envelopeNameFallback(id)),
  }))
}

/**
 * Set what one envelope counts, and tell every card that draws it.
 *
 * It is called on **every toggle** rather than on a save button, because the card behind the
 * panel is the answer to "what does this do?" — the gauge moves while the panel is open,
 * which is a far better explanation than a caption under a list.
 */
export function setEnvelopeTracked(id: string, categories: BudgetTracked): void {
  updateEnvelope(id, (envelope) => ({
    ...envelope,
    tracked: categories === null ? null : [...new Set(categories)],
  }))
}

/** Set the stats dial's limit, in paise, and tell the gauge. */
export function setTotalLimit(cents: number): void {
  const current = budgetSnapshot()
  commit({
    envelopes: current.envelopes,
    total: { ...current.total, limitCents: limitFrom(cents, BUDGET_DEFAULTS.total) },
    activeId: current.activeId,
  })
}

/** Rename the stats dial's budget. Called when the field is left; see `setEnvelopeName`. */
export function setTotalName(name: string): void {
  const current = budgetSnapshot()
  commit({
    envelopes: current.envelopes,
    total: { ...current.total, name: budgetNameFrom(name, BUDGET_NAME_DEFAULTS.total) },
    activeId: current.activeId,
  })
}

/** Set what the stats dial counts, and tell the gauge. */
export function setTotalTracked(categories: BudgetTracked): void {
  const current = budgetSnapshot()
  commit({
    envelopes: current.envelopes,
    total: {
      ...current.total,
      tracked: categories === null ? null : [...new Set(categories)],
    },
    activeId: current.activeId,
  })
}

/** Watch the store. The returned function stops watching. */
export function subscribeBudgets(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
