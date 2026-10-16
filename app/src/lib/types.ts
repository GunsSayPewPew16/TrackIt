/**
 * What the app is made of: rows, and the budgets that came with them.
 *
 * Two rules run through everything here, and both come from the project's own
 * history rather than from taste:
 *
 * 1. **Money is integer paise.** Never a float, never a string of rupees, and
 *    always positive — direction is `kind`, not a sign on the amount. The one
 *    division by 100 happens in `lib/format.ts`, at the edge, when a figure is
 *    written for a person.
 * 2. **A time is one absolute moment, in epoch ms.** Days, times and "Yesterday"
 *    are all derived from it, so nothing in storage goes stale when the clock
 *    moves past it.
 */

/** Spending or income. Income is money in, and never counts as spending. */
export type Kind = "expense" | "income"

/**
 * The three card treatments the ledger artboard draws, kept as domain-level
 * styles rather than class names so that a row can be *sorted* into one:
 *
 * - `std` — an ordinary expense: the card, the hairline, ink text.
 * - `alt` — a big one, filled with the clay accent.
 * - `inc` — money in, filled with the sage accent.
 */
export type CardStyle = "std" | "alt" | "inc"

/** One thing that happened to the owner's money. */
export type Row = {
  /** Wallet's document id, so re-importing the same export changes nothing. */
  id: string
  /** What it was: the owner's note, the merchant, or the category it was filed under. */
  title: string
  /** A category id from `lib/categories.ts`. */
  category: string
  /** An account id from `lib/accounts.ts`. */
  account: string
  /** Integer paise, always positive. */
  amountCents: number
  kind: Kind
  /** When it happened, epoch ms. This is the row's only clock. */
  at: number
  /**
   * The second half of a card's subtitle, after the category — the artboard's
   * own `Month run`, `Weekly shop`, `Monthly rent`. Wallet's notes are empty, so
   * most imported rows have none and the card shows the category alone.
   */
  note?: string
  /**
   * The pill above the card's notch, when the row names its own instead of taking
   * the one its category and amount would give it (`Income`, `High expense`, the
   * category's label). The artboard draws one, so the dataset carries one.
   */
  tag?: string
  /**
   * A Lucide icon name for the card's tile, overriding the category's own marker.
   * The artboard gives each sample row a face (`coffee`, `bus`, `cart`, `laptop`,
   * `home`, `wallet`) that is not its category's marker, so the demo dataset says
   * so explicitly and imported rows fall back to their category.
   */
  icon?: string
  /** Who was in on it, by initials — the artboard's little stack of faces. */
  people?: string[]
  /** Where the row came from. `upi` is the scan-and-pay flow's own mark. */
  source?: "manual" | "shortcut" | "upi"
}

/**
 * A spending limit the owner set in Wallet, and the rows it covers.
 *
 * Wallet's own `Budget` documents name an amount, a start date and a list of
 * envelope ids, and an envelope id is a category's. The import turns those ids
 * into category ids, so an envelope here is a limit plus the categories filed
 * under it — which is what the dashboard's gauge measures against.
 */
export type Budget = {
  id: string
  name: string
  /** Integer paise: what the owner allowed themselves. */
  limitCents: number
  /** The categories the money counts against. */
  categoryIds: string[]
  /** When the envelope's period began, epoch ms. */
  startDate: number
}

/** A day's rows, for the ledger's wheel and list. */
export type DayGroup = {
  /** The day, midnight local, epoch ms. */
  day: number
  rows: Row[]
}
