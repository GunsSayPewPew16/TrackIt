/**
 * The balance cards the owner has added, beside the two accounts Wallet imported, and the order
 * the whole stack is in.
 *
 * A custom card is a **label, an icon and a colour** — nothing about its money lives here.
 * Its figure is an opening in the balance store (`lib/balances.ts`), keyed by the card's id,
 * exactly like UPI's and Cash's: holding the card sets that opening, and with no ledger rows
 * filed against it, the card reads what the owner typed. Rows cannot be filed under a custom
 * card yet, so `accountFor` still sends them to the primary account and a custom card's
 * income and expenses are always zero.
 *
 * The stack's **order** is kept here too, as the list of every card's id front to back. It is
 * what "send to front" and "send to back" write, and what a drag's re-stack writes after it.
 *
 * Like the balances, both are **per ledger**: `trackit-cards-v2` and `trackit-card-order` on this
 * device, and the same keys under `:u:<uuid>` for a signed-in account.
 */

import { ownerStorageKey, subscribeBalances } from "./balances"
import { money, wholeMoney } from "./format"
import type { BalanceCard } from "./view"

/** The icons a card can wear. The names are Lucide's; the components are in `components/BalanceCards.tsx`. */
export const CARD_ICON_NAMES = [
  "Wallet",
  "CreditCard",
  "PiggyBank",
  "Landmark",
  "Coins",
  "Gift",
  "Plane",
  "ShoppingBag",
] as const
export type CardIconName = (typeof CARD_ICON_NAMES)[number]

/**
 * The colours the owner can pick for a card: the five slots of the current palette. A slot is a
 * position, not a colour: `tone-3` is whichever third colour the palette declares (`tones` in
 * `lib/theme.ts`), so the picker shows one palette's five and a palette change repaints them.
 */
export const CARD_TONES = ["tone-1", "tone-2", "tone-3", "tone-4", "tone-5"] as const

/**
 * Colours cards were given before the palette slots. They are still drawn, so a card the owner
 * already made keeps its colour, but they are never offered for a new one. The named tokens were
 * the shared ones, which is why they were replaced.
 */
export const LEGACY_CARD_TONES = ["clay", "gold", "sage", "chart", "teal", "red", "indigo"] as const

export type CardTone = (typeof CARD_TONES)[number] | (typeof LEGACY_CARD_TONES)[number]

export type CustomCard = {
  id: string
  /** What the owner named it. Shown on the card in place of an account name. */
  label: string
  icon: CardIconName
  tone: CardTone
}

const STORAGE_KEY = "trackit-cards-v2"
/** The key cards were kept under before the slots ran lightest to darkest. Read once, then left alone. */
const LEGACY_STORAGE_KEY = "trackit-cards"
const ORDER_KEY = "trackit-card-order"

/**
 * Where a slot went when the palettes were renumbered. The slots used to run darkest to lightest;
 * `tone-N` is now the Nth lightest, so a card kept under the old numbers moves to `tone-(6 - N)`,
 * which is the same colour in every palette that was not redesigned.
 */
const RENUMBERED_SLOT: Partial<Record<CardTone, CardTone>> = {
  "tone-1": "tone-5",
  "tone-2": "tone-4",
  "tone-3": "tone-3",
  "tone-4": "tone-2",
  "tone-5": "tone-1",
}
const LABEL_LIMIT = 24

let cache: { key: string; cards: CustomCard[] } | null = null
let orderCache: { key: string; ids: string[] } | null = null
const listeners = new Set<() => void>()

const announce = (): void => {
  for (const listener of listeners) listener()
}

const isIcon = (value: unknown): value is CardIconName =>
  typeof value === "string" && (CARD_ICON_NAMES as readonly string[]).includes(value)

const isTone = (value: unknown): value is CardTone =>
  typeof value === "string" && ([...CARD_TONES, ...LEGACY_CARD_TONES] as readonly string[]).includes(value)

/** A stored card is kept only if every part of it is still a thing the app can draw. */
function read(key: string): CustomCard[] {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry): CustomCard[] => {
      if (typeof entry !== "object" || entry === null) return []
      const card = entry as Record<string, unknown>
      if (typeof card.id !== "string" || typeof card.label !== "string") return []
      if (!isIcon(card.icon) || !isTone(card.tone)) return []
      return [{ id: card.id, label: card.label.slice(0, LABEL_LIMIT), icon: card.icon, tone: card.tone }]
    })
  } catch {
    return []
  }
}

function readOrder(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === "string")
  } catch {
    return []
  }
}

/** The owner's cards, handed back by reference until something changes. */
export function customCardsSnapshot(): CustomCard[] {
  const key = ownerStorageKey(STORAGE_KEY)
  if (cache === null || cache.key !== key) cache = { key, cards: readCards(key) }
  return cache.cards
}

/**
 * The owner's cards under the current key. A browser with no cards under it yet is moved once from
 * the legacy key, with each slot renumbered; the new copy is written only once it is made, so a
 * refused write is simply tried again on the next visit.
 */
function readCards(key: string): CustomCard[] {
  if (window.localStorage.getItem(key) !== null) return read(key)
  const migrated = read(ownerStorageKey(LEGACY_STORAGE_KEY)).map((card) => ({
    ...card,
    tone: RENUMBERED_SLOT[card.tone] ?? card.tone,
  }))
  if (migrated.length > 0) {
    try {
      window.localStorage.setItem(key, JSON.stringify(migrated))
    } catch {
      // Still migrated for this session; the copy is made again on the next visit.
    }
  }
  return migrated
}

/** Every card's id front to back, as last arranged. Empty until the owner arranges the stack. */
export function cardOrderSnapshot(): string[] {
  const key = ownerStorageKey(ORDER_KEY)
  if (orderCache === null || orderCache.key !== key) orderCache = { key, ids: readOrder(key) }
  return orderCache.ids
}

/** Write the stack's order, front to back. */
export function setCardOrder(ids: string[]): void {
  const key = ownerStorageKey(ORDER_KEY)
  orderCache = { key, ids: [...ids] }
  try {
    window.localStorage.setItem(key, JSON.stringify(orderCache.ids))
  } catch {
    // The order still holds for this session; only remembering it was refused.
  }
  announce()
}

/**
 * Add a card to the end of the stack and remember it. The id is minted here, so a label
 * the owner types twice still makes two cards.
 */
export function addCustomCard(input: Omit<CustomCard, "id">): CustomCard {
  const key = ownerStorageKey(STORAGE_KEY)
  const card: CustomCard = {
    id: `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    label: input.label.trim().slice(0, LABEL_LIMIT),
    icon: input.icon,
    tone: input.tone,
  }
  const cards = [...customCardsSnapshot(), card]
  cache = { key, cards }
  try {
    window.localStorage.setItem(key, JSON.stringify(cards))
  } catch {
    // The card still shows for this session; only remembering it was refused.
  }
  announce()
  return card
}

/** Remove one of the owner's own cards, and its place in the stack. The accounts cannot be removed. */
export function removeCustomCard(id: string): void {
  const key = ownerStorageKey(STORAGE_KEY)
  const cards = customCardsSnapshot().filter((card) => card.id !== id)
  cache = { key, cards }
  try {
    window.localStorage.setItem(key, JSON.stringify(cards))
  } catch {
    // The card is gone for this session; only forgetting it was refused.
  }
  setCardOrder(cardOrderSnapshot().filter((existing) => existing !== id))
}

/**
 * Put cards in the stored order. A card the order does not name yet keeps its place after the
 * named ones, so a card added since the last arrangement lands at the back.
 */
export function applyCardOrder<T extends { id: string }>(cards: T[], order: string[]): T[] {
  if (order.length === 0) return cards
  const rank = new Map(order.map((id, index) => [id, index]))
  return cards
    .map((card, index) => ({ card, sort: rank.get(card.id) ?? order.length + index }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ card }) => card)
}

/**
 * The owner's cards as stack cards, after the two accounts. What each holds is its opening, and
 * no row is filed under one yet, so it has nothing spent from it this month.
 */
export function customCardsOf(cards: CustomCard[], openings: Record<string, number>): BalanceCard[] {
  return cards.map((card) => {
    const cents = Math.max(openings[card.id] ?? 0, 0)
    return {
      id: card.id,
      name: card.label,
      icon: card.icon,
      tone: card.tone,
      cents,
      balance: money(cents),
      spent: wholeMoney(0),
    }
  })
}

/**
 * Watch the cards and their order. An owner change is also a change: the balance store announces
 * it, and both are read again under the new owner's keys.
 */
export function subscribeCustomCards(listener: () => void): () => void {
  listeners.add(listener)
  const stop = subscribeBalances(listener)
  return () => {
    listeners.delete(listener)
    stop()
  }
}
