/**
 * The re-filing: the owner's history, moved onto the six dimensions the manual entry
 * offers.
 *
 * The ledger was imported from Wallet, and Wallet's tree is deeper than the picker in
 * `features/manual-entry/CategoryMatrix.tsx`: it has envelopes the matrix has no tile
 * for (`Friends`, `Stationery, tools`, `Culture, sport events`, `Long distance`) and it
 * names others in a wording the new tiles have moved past (`Mobile Recharge` where the
 * matrix now says **Internet & Mobile**, `Phone, cell phone` likewise). Every row still
 * had to be *somewhere*, so the old ids stayed and the ledger read in a vocabulary the
 * picker no longer speaks.
 *
 * This file closes that gap **without inventing a single category**: an id the matrix
 * cannot offer is re-homed to the nearest id it can, and a row whose title is just the
 * old envelope's own name is re-titled with the new one. Nothing else about a row is
 * touched — the amount, the date, the account, the note and the id it is deduplicated
 * by are exactly as they were.
 *
 * Three rules keep it honest:
 *
 * - **Nearest, not tidiest.** `Mobile Recharge` is the same money as `Internet` on a
 *   phone bill, so it is re-homed to `internet` and reads *Internet & Mobile*. Where
 *   nothing is near — `Friends` is social spending with no envelope of its own — the row
 *   goes to the parent dimension (`life-entertainment`, *Life & Leisure*) rather than
 *   being forced into a leaf that would misname it.
 * - **Only an auto-filled title is renamed.** Wallet wrote a row's title as its
 *   category's name, so a title that still reads as one — either the app's current label
 *   for that envelope or the spelling the importer wrote before the table was re-labelled
 *   (`WALLET_TITLES`) — is the importer's own text and is safe to replace. A title the
 *   owner typed matches neither and is left alone.
 * - **Nothing is destroyed on the way in.** The map is applied wherever rows are read
 *   (the bundled sheet, the stored ledger, an imported backup), so an old backup
 *   re-imported next year lands on the same tree. It is idempotent: every target id is
 *   an id the matrix offers, and its label is not itself a key of the map, so a second
 *   pass is a no-op.
 */

import { categoryFor } from "./categories"
import type { Budget, Row } from "./types"

/**
 * The old envelope, and the id the new tree files that money under.
 *
 * The values are all ids that already exist in `lib/categories.ts` — the same table the
 * matrix's tiles and pills point at — which is why this is a table of *destinations* and
 * not a new taxonomy.
 */
const REHOMED: Record<string, string> = {
  // Social spending has no leaf of its own: the dimension it belongs to is the honest home.
  friends: "life-entertainment",
  // Culture and sport events, same reasoning.
  "culture-sport": "life-entertainment",
  // Pens, paper and tools are bought, which is what the Shopping dimension is.
  stationery: "shopping",
  // The matrix's own pill for this money is *Books & Education*.
  education: "books-subs",
  // `Wellness, beauty` is the same envelope the matrix calls *Health & Beauty*.
  wellness: "health-beauty",
  // A long-distance fare is transport; there is no leaf of its own.
  "long-distance": "transportation",
  // A phone and a recharge are the same bill as *Internet & Mobile*.
  phone: "internet",
  "mobile-recharge": "internet",
}

/**
 * The names the importer wrote into `title` before `lib/categories.ts` was re-labelled.
 *
 * Wallet's export names a category more fully than the table now does — the tool wrote
 * `Restaurant, fast-food` where the app now says `Restaurant` — so a row filed by the
 * import carries that older spelling. These are the owner's own rows' titles, taken from
 * the bundled sheet, and they exist for one purpose: to recognise text this app wrote
 * itself, so it may be replaced with the new name.
 */
const WALLET_TITLES: Record<string, string[]> = {
  restaurant: ["Restaurant, fast-food"],
  "culture-sport": ["Culture, sport events"],
  stationery: ["Stationery, tools"],
  "public-transport": ["Public transport"],
  friends: ["Friends"],
  "books-subs": ["Books, audio, subscriptions"],
  wellness: ["Wellness, beauty"],
  "mobile-recharge": ["Mobile Recharge"],
  education: ["Education, development"],
  "health-beauty": ["Health and beauty"],
  allowance: ["Allowance"],
  "long-distance": ["Long distance"],
  phone: ["Phone, cell phone"],
  "food-drinks": ["Food & Drinks"],
  "bar-cafe": ["Bar, cafe"],
}

/**
 * What a re-filed row is called now.
 *
 * Only envelopes whose meaning survives the move: `restaurant` is the matrix's
 * *Restaurants*, `internet` is *Internet & Mobile*, and the two dimensions a re-homed row
 * can land on keep their own names. `food-drinks` is the one *renamed* rather than
 * re-homed — the owner calls that dimension **Food & Beverages** now, and the name is here
 * so the ledger says what the picker says. The ids the matrix splits between two pills — a
 * `bar-cafe` row is a coffee shop *or* a bar, `tv-streaming` is Spotify *or* a film, and
 * `financial-investments` is stocks *or* funds — are deliberately absent: the row is
 * where it belongs, but only the owner knows which of the two it was, and a title is not
 * something this pass is allowed to guess.
 */
const NEW_NAME: Record<string, string> = {
  restaurant: "Restaurants",
  groceries: "Groceries",
  internet: "Internet & Mobile",
  "public-transport": "Public Transit",
  "books-subs": "Books & Education",
  "health-beauty": "Health & Beauty",
  fuel: "Fuel & Petrol",
  taxi: "Taxi & Rideshare",
  "vehicle-maintenance": "Maintenance",
  allowance: "Allowance",
  "food-drinks": "Food & Beverages",
  housing: "Housing & Utilities",
  shopping: "Shopping",
  transportation: "Transportation",
  "life-entertainment": "Life & Leisure",
}

/**
 * The name the app gives a category when it says it to the owner.
 *
 * `categories.ts` is the import's own table and keeps Wallet's full names, which is right
 * for matching a label on the way in and wrong for reading: a screen that says
 * *Restaurant, fast-food* beside a picker that says **Restaurants** is speaking two
 * vocabularies. This is the one place that decides which of the two a person sees, and it
 * answers with the table's label for every category the matrix has not renamed — which is
 * almost all ninety of them.
 */
export function filedName(id: string): string {
  return NEW_NAME[id] ?? categoryFor(id).label
}

/** The row as the new tree files it, or the row it already was. */
export function refileRow(row: Row): Row {
  const category = REHOMED[row.category] ?? row.category
  const name = NEW_NAME[category]
  const title = row.title.trim().toLowerCase()
  const written = [categoryFor(row.category).label, ...(WALLET_TITLES[row.category] ?? [])]
  // A title that still says the old envelope's name is the importer's text, not the
  // owner's: everything else about the row is left exactly as it is.
  const autoTitled = name !== undefined && written.some((label) => label.toLowerCase() === title)
  if (category === row.category && !autoTitled) return row
  return { ...row, category, ...(autoTitled ? { title: name } : {}) }
}

/** The same move for an envelope's categories; the limit and the name are untouched. */
export function refileBudget(budget: Budget): Budget {
  const categoryIds = budget.categoryIds.map((id) => REHOMED[id] ?? id)
  return categoryIds.some((id, index) => id !== budget.categoryIds[index]) ? { ...budget, categoryIds } : budget
}

/**
 * The whole snapshot, re-filed, with a count of what actually moved so a caller can decide
 * whether it is worth writing the store back.
 */
export function refile(rows: Row[], budgets: Budget[]): { rows: Row[]; budgets: Budget[]; changed: number } {
  let changed = 0
  const nextRows = rows.map((row) => {
    const next = refileRow(row)
    if (next !== row) changed += 1
    return next
  })
  const nextBudgets = budgets.map(refileBudget)
  return { rows: nextRows, budgets: nextBudgets, changed }
}
