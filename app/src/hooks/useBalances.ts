import { useCallback, useSyncExternalStore } from "react"

import { openingSnapshot, setAccountBalance, subscribeBalances } from "@/lib/balances"
import {
  addCustomCard,
  cardOrderSnapshot,
  customCardsSnapshot,
  removeCustomCard,
  setCardOrder,
  subscribeCustomCards,
  type CustomCard,
} from "@/lib/customCards"
import type { Row } from "@/lib/types"

/**
 * What the accounts start from, and the one way to change it.
 *
 * The store lives outside React (`lib/balances.ts`) because the dashboard's stack reads it
 * and the figure has to survive a reload. `useSyncExternalStore` keeps the stack in step
 * without copying the openings into state, and the store hands back one cached snapshot, so
 * reading it twice cannot re-render anything.
 *
 * `setBalance` is given the **rows**, because what gets stored is not the figure the owner
 * typed but the opening that produces it — see `lib/balances.ts` for why that is the only
 * way a card can keep being a balance after the next row is logged.
 *
 * The owner's own cards and the stack's order (`lib/customCards.ts`) come through the same hook.
 */
export function useBalances(rows: Row[]) {
  const openings = useSyncExternalStore(subscribeBalances, openingSnapshot, openingSnapshot)
  const customCards: CustomCard[] = useSyncExternalStore(
    subscribeCustomCards,
    customCardsSnapshot,
    customCardsSnapshot,
  )
  const cardOrder = useSyncExternalStore(subscribeCustomCards, cardOrderSnapshot, cardOrderSnapshot)

  const setBalance = useCallback(
    (accountId: string, cents: number) => setAccountBalance(accountId, cents, rows),
    [rows],
  )

  return {
    openings,
    setBalance,
    customCards,
    cardOrder,
    addCard: addCustomCard,
    removeCard: removeCustomCard,
    reorderCards: setCardOrder,
  }
}
