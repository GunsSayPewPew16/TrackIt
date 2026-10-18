import { AnimatePresence, motion } from "framer-motion"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { useEffect, useState } from "react"

import { join } from "@/lib/classes"
import { addDays, monthLabel, sameDay, startOfDay, startOfMonth } from "@/lib/format"
import { lightTap, mediumClick } from "@/lib/haptics"

/**
 * The add-record sheet's date picker.
 *
 * It exists for the row the owner remembered too late: a coffee bought on the 12th and
 * typed on the 18th belongs on the 12th, in that day's ledger and in that month's budget
 * total. The sheet used to take `Date.now()` and nothing else, so a forgotten expense could
 * only ever be filed on the day it was remembered.
 *
 * **It is a month grid, not a wheel.** The app's other date surface (`components/DateWheel`)
 * is a 276px arc built to browse one month of *rows*; here the question is one day, the
 * answer is usually within the last week, and the surface has to sit over a full-screen
 * sheet without pushing its keypad anywhere. A 358px card of 36px day cells answers it in
 * two taps, and its clothes are the app's own — the 20px radii, the hairline, the display
 * face for the month, the editorial italic for the question — because no artboard draws it.
 *
 * **Forward is closed, not merely greyed.** The right chevron and every day after today are
 * disabled at the current month: an expense cannot have happened tomorrow, and offering the
 * day would only invite a typo to land in the future. Backwards is unbounded, because the
 * owner's history is.
 *
 * Every control ticks at the light weight. There is no confirming thud here — the day is
 * chosen, not committed; the sheet's own **add record** is where the thud lives.
 */
const SPRING = { type: "spring", stiffness: 420, damping: 32 } as const
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]
const DAY = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric" })

export type DateDialogProps = {
  isOpen: boolean
  /** The day the sheet is currently on: local midnight. */
  value: number
  /** The moment the sheet was opened, which is the latest day it may offer. */
  now: number
  onClose: () => void
  /** The chosen day, as local midnight. */
  onPick: (day: number) => void
}

export function DateDialog({ isOpen, value, now, onClose, onPick }: DateDialogProps) {
  // The grid opens on the month the field is showing, every time it is opened. The reset is
  // done during render (React's own rule for state a changed prop invalidates): an effect
  // would paint the previous month for a frame before snapping to the current one.
  const [month, setMonth] = useState(() => startOfMonth(value))
  const [wasOpen, setWasOpen] = useState(false)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) setMonth(startOfMonth(value))
  }

  useEffect(() => {
    if (!isOpen) return
    /*
     * Capture phase, and the propagation stops here: the sheet underneath has its own
     * window Escape handler, and an Escape meant to close this grid must not also throw
     * away the amount that was being typed behind it.
     */
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [isOpen, onClose])

  const thisMonth = startOfMonth(now)
  const today = startOfDay(now)
  const atLatestMonth = startOfMonth(month) >= thisMonth

  const first = new Date(startOfMonth(month))
  const lead = (first.getDay() + 6) % 7 // Monday-first, like the heatmap
  const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const days = Array.from({ length }, (_, index) => addDays(first.getTime(), index))

  const choose = (day: number) => {
    lightTap()
    onPick(day)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="date-dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
            className="fixed inset-0 z-[60] bg-canvas"
          />

          <div className="pointer-events-none fixed inset-0 z-[65] grid place-items-center px-4">
            <motion.div
              key="date-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Expense date"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
              transition={SPRING}
              className="pointer-events-auto w-full max-w-[358px] rounded-[20px] border border-line bg-card p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="font-editorial text-[18px] leading-7 italic text-ink">When was this?</p>
                <button
                  type="button"
                  aria-label="Close without changing the date"
                  onClick={() => {
                    mediumClick()
                    onClose()
                  }}
                  className="grid size-8 flex-none place-items-center rounded-2xl border border-line bg-transparent text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  <X strokeWidth={1.5} className="size-4" aria-hidden="true" />
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <span className="font-display text-lg leading-6 font-medium tracking-[-0.01em] text-ink">
                  {monthLabel(month)}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Previous month"
                    onClick={() => {
                      lightTap()
                      setMonth((from) => {
                        const when = new Date(from)
                        when.setMonth(when.getMonth() - 1)
                        return when.getTime()
                      })
                    }}
                    className="grid size-8 place-items-center rounded-2xl border border-line bg-transparent text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
                  >
                    <ChevronLeft strokeWidth={1.5} className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next month"
                    disabled={atLatestMonth}
                    onClick={() => {
                      lightTap()
                      setMonth((from) => {
                        const when = new Date(from)
                        when.setMonth(when.getMonth() + 1)
                        return when.getTime()
                      })
                    }}
                    className="grid size-8 place-items-center rounded-2xl border border-line bg-transparent text-ink outline-none transition-opacity disabled:opacity-25 focus-visible:ring-2 focus-visible:ring-ink"
                  >
                    <ChevronRight strokeWidth={1.5} className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div aria-hidden="true" className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] leading-4 text-ink2">
                {WEEKDAYS.map((letter, index) => (
                  <span key={`${letter}-${index}`}>{letter}</span>
                ))}
              </div>

              <div className="mt-1 grid grid-cols-7 gap-1">
                {Array.from({ length: lead }, (_, index) => (
                  <span key={`lead-${index}`} aria-hidden="true" />
                ))}
                {days.map((day) => {
                  const future = day > today
                  const selected = sameDay(day, value)
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={future}
                      aria-pressed={selected}
                      aria-label={DAY.format(day)}
                      onClick={() => choose(day)}
                      className={join(
                        "grid h-9 place-items-center rounded-xl font-sans text-[13px] leading-4 tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-25",
                        selected
                          ? "border border-sage bg-sage font-medium text-on-sage"
                          : "border border-transparent text-ink hover:bg-line",
                        !selected && sameDay(day, today) && "border-sage text-sage",
                      )}
                    >
                      {new Date(day).getDate()}
                    </button>
                  )
                })}
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                <span className="font-editorial text-[12px] leading-4 italic text-ink2">
                  The ledger files it on this day
                </span>
                <button
                  type="button"
                  onClick={() => choose(today)}
                  className="h-9 flex-none rounded-2xl border border-sage bg-transparent px-3 font-sans text-[12px] leading-4 font-medium tracking-wide-tag text-sage outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  today
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
