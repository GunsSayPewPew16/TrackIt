import { Dialog } from "radix-ui"
import { FileJson, FileSpreadsheet, Trash2, Upload, X } from "lucide-react"
import { useCallback, useRef, useState } from "react"

import { toCsv, toJson } from "@/lib/history"
import type { Row } from "@/lib/types"

/**
 * Where a history comes in and goes out.
 *
 * **Not mounted at the moment.** The owner has taken it out of the UI while they
 * decide where it belongs — the header's second 48px circle now opens the ledger — so
 * nothing renders this panel today. It is kept whole because the import is not
 * decoration: the app is driven by the owner's Wallet export, and the panel is the only
 * place that takes the file. Wiring it up again is one state hook and one `onImport` /
 * `onClear` in `App.tsx` (see `useLedger`, which still exposes both).
 *
 * The arrangement is deliberate, and it is the one the previous design arrived at:
 * **importing is the primary action** (it is the rare, hard-to-undo direction),
 * the two exports are secondary buttons under it, and clearing the ledger sits
 * below a rule as the only destructive thing on the panel, behind a second tap
 * rather than a dialog. Every action reports what it did in the same words as the
 * control that did it, through `role="status"`, and a refusal through
 * `role="alert"`.
 *
 * Radix's Dialog is what makes this a dialog rather than a div: focus goes in and
 * comes back out, Escape closes it, and the overlay is inert while it is open.
 */
function stamp(): string {
  const when = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`
}

/** Hand a string to the browser as a download. */
function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

export function DataSheet({
  open,
  onOpenChange,
  rows,
  onImport,
  onClear,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: Row[]
  /** Reads the file's text; returns the report to show. */
  onImport: (text: string) => { ok: boolean; message: string }
  /** Forgets everything; returns how many rows were let go of. */
  onClear: () => number
}) {
  const [report, setReport] = useState<{ ok: boolean; message: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    async (file: File) => {
      try {
        setReport(onImport(await file.text()))
      } catch {
        setReport({ ok: false, message: "That file could not be read." })
      }
    },
    [onImport],
  )

  const clear = useCallback(() => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    const gone = onClear()
    setConfirming(false)
    setReport({ ok: true, message: `Cleared ${gone} ${gone === 1 ? "row" : "rows"}.` })
  }, [confirming, onClear])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-canvas/80" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-[390px] flex-col gap-4 overflow-y-auto rounded-t-[20px] border border-line bg-card p-6 text-ink">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-display text-xl font-bold leading-7 tracking-[-0.01em]">
                Your history
              </Dialog.Title>
              <Dialog.Description className="text-ink2">
                {rows.length > 0
                  ? `${rows.length} ${rows.length === 1 ? "row" : "rows"} in this ledger.`
                  : "Nothing imported yet — the screens are showing the design’s own sample rows."}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="flex size-12 shrink-0 items-center justify-center rounded-3xl border border-line bg-card text-ink"
            >
              <X className="size-6" strokeWidth={1.5} aria-hidden="true" />
            </Dialog.Close>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleFile(file)
              // Let the same file be picked again after a failed read.
              event.target.value = ""
            }}
          />

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex h-12 items-center justify-center gap-2 rounded-[20px] bg-clay px-4 text-[10px] font-bold uppercase leading-4 tracking-[0.03em] text-on-clay"
          >
            <Upload className="size-5" strokeWidth={1.5} aria-hidden="true" />
            Import from a file
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                download(`trackit-${stamp()}.json`, toJson(rows), "application/json")
                setReport({ ok: true, message: `Exported ${rows.length} rows as JSON.` })
              }}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[20px] border border-line px-4 text-[10px] font-bold uppercase leading-4 tracking-[0.03em]"
            >
              <FileJson className="size-5" strokeWidth={1.5} aria-hidden="true" />
              Export JSON
            </button>
            <button
              type="button"
              onClick={() => {
                download(`trackit-${stamp()}.csv`, toCsv(rows), "text/csv")
                setReport({ ok: true, message: `Exported ${rows.length} rows as CSV.` })
              }}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[20px] border border-line px-4 text-[10px] font-bold uppercase leading-4 tracking-[0.03em]"
            >
              <FileSpreadsheet className="size-5" strokeWidth={1.5} aria-hidden="true" />
              Export CSV
            </button>
          </div>

          {report && (
            <p
              role={report.ok ? "status" : "alert"}
              className={`rounded-[16px] border p-3 ${report.ok ? "border-line text-ink" : "border-clay text-clay"}`}
            >
              {report.message}
            </p>
          )}

          <hr className="border-line" />

          <button
            type="button"
            onClick={clear}
            onBlur={() => setConfirming(false)}
            className="flex h-12 items-center justify-center gap-2 rounded-[20px] border border-clay px-4 text-[10px] font-bold uppercase leading-4 tracking-[0.03em] text-clay"
          >
            {confirming ? (
              "Tap again to clear everything"
            ) : (
              <>
                <Trash2 className="size-5" strokeWidth={1.5} aria-hidden="true" />
                Start over
              </>
            )}
          </button>

          <p className="text-ink2">
            TrackIt reads Wallet’s own backup, this app’s JSON export, and the JSON other trackers write.
            Importing the same file twice changes nothing.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
