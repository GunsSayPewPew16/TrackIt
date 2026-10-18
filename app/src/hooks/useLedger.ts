import { useCallback, useSyncExternalStore } from "react"

import { readHistory, type DropReason } from "@/lib/history"
import { appendToLedger, clearLedger, ledgerSnapshot, removeFromLedger, subscribeLedger } from "@/lib/ledger"

/** What an import did, in the words the screen shows the owner. */
export type ImportReport = { ok: boolean; message: string }

/**
 * The things that were left out, said as one clause: `1 transfer and 10 rows with
 * no date`.
 *
 * Both forms of every reason are carried by the import itself (`reason` for
 * several, `one` for a single row), because no suffix rule turns "rows with no
 * date" into anything a person would write.
 */
function leftOutClause(dropped: DropReason[]): string {
  const said = dropped
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.count} ${entry.count === 1 ? entry.one : entry.reason}`)
  if (said.length === 0) return ""
  if (said.length === 1) return said[0]
  return `${said.slice(0, -1).join(", ")} and ${said[said.length - 1]}`
}

/**
 * The owner's ledger, and the two things that change it.
 *
 * The store lives outside React (`lib/ledger.ts`), because it outlives any one
 * screen: a row imported on the dashboard is still there when the ledger opens.
 * `useSyncExternalStore` is what keeps a screen in step with it without copying
 * the rows into state, and `lib/ledger.ts` hands back one cached snapshot so that
 * reading it repeatedly cannot re-render anything.
 *
 * `importHistory` never throws. A file that is not JSON comes back as a message,
 * a file where every row was unreadable comes back as a message, and a file that
 * was already imported comes back saying so — which is the mistake anyone makes
 * with a backup, and the one worth answering kindly.
 */
export function useLedger() {
  const snapshot = useSyncExternalStore(subscribeLedger, ledgerSnapshot, ledgerSnapshot)

  const importHistory = useCallback((text: string): ImportReport => {
    const result = readHistory(text)
    if (!result.ok) return { ok: false, message: result.message }

    const { rows, budgets, dropped } = result.summary
    const { added, skipped } = appendToLedger({ rows, budgets })
    const clause = leftOutClause(dropped)

    if (added === 0) {
      // Nothing to add, and nothing usable to add, are different things to say:
      // the first is a backup opened twice, the second is a file to look at.
      if (rows.length === 0) {
        const tail = clause ? ` ${clause} left out.` : ""
        return {
          ok: false,
          message: `Nothing in that file could be used.${tail}`,
        }
      }
      const tail = clause ? `; ${clause} left out.` : ""
      return { ok: true, message: `Nothing to add — ${skipped} were already here${tail}` }
    }

    const envelopeWords =
      budgets.length > 0 ? ` and ${budgets.length} ${budgets.length === 1 ? "envelope" : "envelopes"}` : ""
    const tail = clause ? ` ${clause} left out.` : ""
    return {
      ok: true,
      message: `Added ${added} ${added === 1 ? "row" : "rows"}${envelopeWords}.${tail}`,
    }
  }, [])

  const clear = useCallback(() => clearLedger(), [])

  /** A long press on a ledger card: take that one row back, and its budgets stay. */
  const remove = useCallback((id: string) => removeFromLedger(id), [])

  return { rows: snapshot.rows, budgets: snapshot.budgets, importHistory, clear, remove }
}
