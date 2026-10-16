import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ThemeSwitch } from "@/components/ui/theme-switch"
import { readHistory, toCsv, toJson, type DropReason } from "@/lib/history"
import type { LedgerRow } from "@/lib/ledger"

/**
 * Settings, as a screen in its own right.
 *
 * Three things live here and nothing else: how the ledger looks, what it holds, and
 * the one action that empties it. They are in that order because that is the order
 * of how often they are wanted — a preference, then the data the owner came for,
 * then the irreversibly destructive thing last and set apart from the controls above
 * it, which is where a button that forgets rows belongs.
 *
 * The screen owns its own feedback. Every action reports what it did in the same
 * words the control used ("Export JSON" → "Exported 54 rows as JSON"), because a
 * download or an import is otherwise invisible: the browser shows a file leaving,
 * and nothing at all about what was in it.
 */

type Props = {
  /** Every row the ledger shows, in the shape the writers want. */
  rows: LedgerRow[]
  /** Add imported rows to the ledger. Returns what actually landed. */
  onImport: (rows: LedgerRow[]) => { added: number; skipped: number }
  /** Forget every row this browser added. Returns how many were let go of. */
  onClear: () => number
  onClose: () => void
}

/** What the screen says about the last thing that happened. */
type Status = { kind: "ok" | "error"; message: string } | null

/** Hand text to the browser's downloads, then let go of the object URL. */
function downloadText(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** Both export names carry the day they were written, like the app's own backups. */
const today = () => new Date().toISOString().slice(0, 10)

/** "1 transfer", "12 income rows" — a count with the words that fit it. */
const counted = (drop: DropReason) => `${drop.count} ${drop.count === 1 ? drop.one : drop.reason}`

/**
 * What one import did, in the owner's terms.
 *
 * Rows the file carried but this ledger cannot use are named individually rather
 * than added up, because "5 were left out" invites a search through the file for
 * which five, and "12 income rows and 2 rows with no date" does not.
 */
function importReport(added: number, skipped: number, dropped: DropReason[], inFile: number): Status {
  if (inFile === 0) {
    return {
      kind: "error",
      message: `Nothing in that file could be used — ${dropped.map(counted).join(" and ")}. A row needs an amount and a date.`,
    }
  }

  const clauses = [`Added ${added} ${added === 1 ? "row" : "rows"}`]
  if (skipped > 0) clauses.push(`${skipped} ${skipped === 1 ? "was" : "were"} already here`)
  if (dropped.length > 0) clauses.push(`${dropped.map(counted).join(" and ")} left out`)

  if (added === 0) {
    return { kind: "ok", message: `Nothing to add — ${clauses.slice(1).join("; ")}.` }
  }
  return { kind: "ok", message: `${clauses.join(". ")}.` }
}

export function SettingsScreen({ rows, onImport, onClear, onClose }: Props) {
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState(false)
  /** The clear button's second tap: set on the first, gone again if it is ignored. */
  const [confirming, setConfirming] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    }
  }, [])

  async function handleFile(input: File) {
    setBusy(true)
    setStatus(null)
    try {
      const result = readHistory(await input.text())
      if (!result.ok) {
        setStatus({ kind: "error", message: result.message })
        return
      }
      const { added, skipped } = onImport(result.summary.rows)
      setStatus(importReport(added, skipped, result.summary.dropped, result.summary.rows.length))
    } catch {
      // `File.text()` failing means the file could not be read at all.
      setStatus({ kind: "error", message: "That file could not be read. Export it again and try once more." })
    } finally {
      setBusy(false)
    }
  }

  function exportJson() {
    downloadText(`trackit-${today()}.json`, toJson(rows), "application/json")
    setStatus({ kind: "ok", message: `Exported ${rows.length} rows as JSON.` })
  }

  function exportCsv() {
    downloadText(`trackit-${today()}.csv`, toCsv(rows), "text/csv")
    setStatus({ kind: "ok", message: `Exported ${rows.length} rows as CSV.` })
  }

  function handleClear() {
    if (!confirming) {
      setConfirming(true)
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      confirmTimer.current = setTimeout(() => setConfirming(false), 5000)
      return
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    setConfirming(false)
    const forgotten = onClear()
    setStatus({
      kind: "ok",
      message: `Forgot ${forgotten} ${forgotten === 1 ? "row" : "rows"}. The demo's own rows are untouched.`,
    })
  }

  return (
    <section aria-label="Settings" className="fixed inset-0 z-50 overflow-y-auto bg-canvas">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-8">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close settings">
            <ArrowLeft />
          </Button>
          <h2 className="font-display text-2xl font-bold tracking-tight">Settings</h2>
        </div>

        <p className="text-sm text-on-canvas/70">How this ledger looks, and what it holds.</p>

        <section aria-labelledby="settings-appearance" className="flex flex-col gap-2">
          <h3
            id="settings-appearance"
            className="text-[11px] font-medium tracking-wide uppercase opacity-70"
          >
            Appearance
          </h3>
          <div className="flex items-center justify-between gap-4 rounded-[24px] border border-ink/10 bg-card p-4 text-ink">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">Theme</span>
              <span className="text-[11px] opacity-75">Dark or light — remembered on this device.</span>
            </div>
            <ThemeSwitch />
          </div>
        </section>

        <section aria-labelledby="settings-history" className="flex flex-col gap-2">
          <h3
            id="settings-history"
            className="text-[11px] font-medium tracking-wide uppercase opacity-70"
          >
            Your history
          </h3>
          <div className="flex flex-col gap-4 rounded-[24px] border border-ink/10 bg-card p-4 text-ink">
            <p className="text-sm opacity-80">
              Bring in a Wallet backup or a TrackIt export, or take this ledger with you.
            </p>

            <div className="flex flex-col gap-2">
              <Button
                variant="accent"
                className="h-11"
                onClick={() => file.current?.click()}
                disabled={busy}
              >
                <Upload />
                {busy ? "Importing…" : "Import from a file"}
              </Button>
              <input
                ref={file}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(event) => {
                  const chosen = event.target.files?.[0]
                  if (chosen) void handleFile(chosen)
                  // Cleared so choosing the same file twice runs the import twice.
                  event.target.value = ""
                }}
              />
              {/* The two exports sit on the card, not on the page, so they are
                  drawn in the card's own ink: the outline variant's `on-canvas`
                  is the cream in the dark theme, which disappears on a card.
                  Same treatment as the outline badge. */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-11 flex-1 border-ink/30 text-ink hover:bg-ink/10"
                  onClick={exportJson}
                  disabled={busy}
                >
                  Export JSON
                </Button>
                <Button
                  variant="outline"
                  className="h-11 flex-1 border-ink/30 text-ink hover:bg-ink/10"
                  onClick={exportCsv}
                  disabled={busy}
                >
                  Export CSV
                </Button>
              </div>
            </div>

            {/* The report is a panel of the box rather than a line of the card,
                because the box is the one surface where this palette lets the
                accent be *text*: `ember` on it is 6.2:1 in the dark theme and
                4.6:1 in the light one, where the same words in `alert` would be
                reading against a cream card at 2.3:1. It is also the loudest
                small thing in the card, which is what feedback has to be. */}
            {status && (
              <p
                role={status.kind === "error" ? "alert" : "status"}
                className={
                  status.kind === "error"
                    ? "rounded-[16px] bg-box px-3 py-2 text-[11px] font-medium tracking-wide text-ember uppercase"
                    : "rounded-[16px] bg-box px-3 py-2 text-[11px] font-medium tracking-wide text-on-box"
                }
              >
                {status.message}
              </p>
            )}

            <p className="text-[11px] leading-relaxed opacity-70">
              JSON keeps every row; CSV opens in a spreadsheet. Rows are matched by id, so importing
              the same file twice adds nothing twice. {rows.length}{" "}
              {rows.length === 1 ? "row" : "rows"} in the ledger now, kept in this browser.
            </p>
          </div>
        </section>

        {/* Separated by a rule and set below the controls, because this is the one
            thing here that cannot be undone. */}
        <section
          aria-labelledby="settings-clear"
          className="flex flex-col gap-2 border-t border-on-canvas/10 pt-5"
        >
          <h3 id="settings-clear" className="text-[11px] font-medium tracking-wide uppercase opacity-70">
            Start over
          </h3>
          <button
            type="button"
            onClick={handleClear}
            className="h-11 cursor-pointer self-start rounded-full px-4 text-sm font-medium text-alert outline-none hover:bg-on-canvas/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tangerine"
          >
            {confirming ? "Tap again to clear them" : "Clear added rows"}
          </button>
          <p className="text-[11px] leading-relaxed opacity-70">
            Forgets everything you imported or scanned on this device. The demo's own rows stay.
          </p>
        </section>
      </div>
    </section>
  )
}
