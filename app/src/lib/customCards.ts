/**
 * The balance cards the owner has added, beside the two accounts Wallet imported.
 *
 * A custom card is a **label, an icon and a colour** — nothing about its money lives here.
 * Its figure is an opening in the balance store (`lib/balances.ts`), keyed by the card's id,
 * exactly like UPI's and Cash's: holding the card sets that opening, and with no ledger rows
 * filed against it, the card reads what the owner typed. Rows cannot be filed under a custom
 * card yet, so `accountFor` still sends them to the primary account and a custom card's
 * income and expenses are always zero.
 *
 * Like the balances, the list is **per ledger**: `trackit-cards` on this device, and
 * `trackit-cards:u:<uuid>` for a signed-in account, so two accounts on one phone never see
 * each other's cards. It is read and written with the same owner that scopes the balances.
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
 * The colours a card can be, each one a token of the current palette (`index.css`). The
 * card's text is chosen to sit on it, so a palette change repaints the card and keeps it legible.
 */
export const CARD_TONES = ["sage", "clay", "gold", "red"] as const
export type CardTone = (typeof CARD_TONES)[number]

export type CustomCard = {
  id: string
  /** What the owner named it. Shown on the card in place of an account name. */
  label: string
  icon: CardIconName
  tone: CardTone
}

const STORAGE_KEY = "trackit-cards"
const LABEL_LIMIT = 24

let cache: { key: string; cards: CustomCard[] } | null = null
const listeners = new Set<() => void>()

const announce = (): void => {
  for (const listener of listeners) listener()
}

const isIcon = (value: unknown): value is CardIconName =>
  typeof value === "string" && (CARD_ICON_NAMES as readonly string[]).includes(value)

const isTone = (value: unknown): value is CardTone =>
  typeof value === "string" && (CARD_TONES as readonly string[]).includes(value)

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

/** The owner's cards, handed back by reference until something changes. */
export function customCardsSnapshot(): CustomCard[] {
  const key = ownerStorageKey(STORAGE_KEY)
  if (cache === null || cache.key !== key) cache = { key, cards: read(key) }
  return cache.cards
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
 * Watch the cards. An owner change is also a change: the balance store announces it, and the
 * cards are read again under the new owner's key.
 */
export function subscribeCustomCards(listener: () => void): () => void {
  listeners.add(listener)
  const stop = subscribeBalances(listener)
  return () => {
    listeners.delete(listener)
    stop()
  }
}
