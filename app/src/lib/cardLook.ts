/**
 * The icon and colour the owner has given a card, by the card's id.
 *
 * Every card can wear one, the two accounts included: UPI is the ink card and Cash the clay one
 * by default (`components/BalanceCards.tsx`), and a look saved here replaces that for that card.
 * It is a *look*, not the card: the name, the figure and what the card is filed under are
 * untouched, which is why it is a small map beside the openings rather than a field on a card.
 *
 * The store is the budget editor's (`lib/budget.ts`): one key per owner, a cached snapshot so
 * `useSyncExternalStore` can compare by identity, listeners, and best-effort storage.
 */

import { ownerStorageKey, subscribeBalances } from "./balances"
import { CARD_ICON_NAMES, CARD_TONES, type CardIconName, type CardTone } from "./customCards"

const STORAGE_KEY = "trackit-card-look"

/** What one card wears. Both are optional: a card may keep its default in either. */
export type CardLook = { icon?: CardIconName; tone?: CardTone }

export type CardLooks = Record<string, CardLook>

let cache: CardLooks | null = null
const listeners = new Set<() => void>()

const announce = (): void => {
  for (const listener of listeners) listener()
}

const isIcon = (value: unknown): value is CardIconName =>
  typeof value === "string" && (CARD_ICON_NAMES as readonly string[]).includes(value)

const isTone = (value: unknown): value is CardTone =>
  typeof value === "string" && (CARD_TONES as readonly string[]).includes(value)

function read(): CardLooks {
  const looks: CardLooks = {}
  try {
    const raw = window.localStorage.getItem(ownerStorageKey(STORAGE_KEY))
    if (!raw) return looks
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return looks
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== "object" || value === null) continue
      const look = value as Record<string, unknown>
      const entry: CardLook = {}
      if (isIcon(look.icon)) entry.icon = look.icon
      if (isTone(look.tone)) entry.tone = look.tone
      looks[id] = entry
    }
    return looks
  } catch {
    return looks
  }
}

/** Every look, handed back by reference until one changes. */
export function cardLooksSnapshot(): CardLooks {
  if (cache === null) cache = read()
  return cache
}

/** Give one card its icon and colour. The card itself is not touched. */
export function setCardLook(cardId: string, look: CardLook): void {
  const next: CardLooks = { ...cardLooksSnapshot(), [cardId]: look }
  cache = next
  try {
    window.localStorage.setItem(ownerStorageKey(STORAGE_KEY), JSON.stringify(next))
  } catch {
    // The look still holds for this session; only remembering it was refused.
  }
  announce()
}

/**
 * Watch the looks. An owner change is also a change: the balance store announces it, and a look
 * is read under the new owner's key.
 */
export function subscribeCardLooks(listener: () => void): () => void {
  listeners.add(listener)
  const stop = subscribeBalances(listener)
  return () => {
    listeners.delete(listener)
    stop()
  }
}
