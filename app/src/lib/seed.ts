/**
 * The owner's expenses sheet, bundled with the app.
 *
 * `history-seed.json` is written by `tools/wallet-import.py --expenses-only` from the Wallet
 * export: spending only, with no income and no transfers. The ledger starts from it in a
 * browser that has never stored anything, so the site shows the owner's money on first
 * visit. A browser's own stored rows always win over it, and clearing the ledger stores
 * an empty one rather than falling back to this file.
 *
 * It is read through the same importer the data panel uses, so the bundled file and an
 * exported backup cannot disagree about what a row is.
 */

import seedText from "./history-seed.json?raw"
import { readHistory } from "./history"
import type { Budget, Row } from "./types"

export type SeedSnapshot = { rows: Row[]; budgets: Budget[] }

/** The bundled sheet, parsed once. An unreadable file is an empty ledger, never a crash. */
export function seedSnapshot(): SeedSnapshot {
  const result = readHistory(seedText)
  if (!result.ok) return { rows: [], budgets: [] }
  return { rows: result.summary.rows, budgets: result.summary.budgets }
}
