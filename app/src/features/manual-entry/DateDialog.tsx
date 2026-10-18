import { AnimatePresence, motion } from "framer-motion"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { useEffect, useState } from "react"

import { join } from "@/lib/classes"
import {
  addDays,
  minutesOfDay,
  momentOn,
  monthLabel,
  parseTimeField,
  sameDay,
  startOfDay,
  startOfMonth,
  timeFieldValue,
} from "@/lib/format"
import { lightTap, mediumClick } from "@/lib/haptics"

/**
 * The add-record sheet's date **and time** picker.
 *
 * It exists for the row the owner remembered too late: a coffee bought on the 12th at 9:40
 * and typed on the 18th belongs on the 12th at 9:40 — in that day's ledger, in that month's
 * budget total, and in the order of that day's rows. The sheet used to take `Date.now()` and
 * nothing else, so a forgotten expense could only ever be filed on the day it was remembered,
 * at the minute it was typed.
 *
 * **It is a month grid, not a wheel.** The app's other date surface (`components/DateWheel`)
 * is a 276px arc built to browse one month of *rows*; here the question is one day, the
 * answer is usually within the last week, and the surface has to sit over a full-screen
 * sheet without pushing its keypad anywhere. A 358px card of 36px day cells answers it in
 * two taps, and its clothes are the app's own — the 20px radii, the hairline, the display
 * face for the month, the editorial italic for the question — because no artboard draws it.
 *
 * **The time is the platform's own field.** A `time` input is a wheel on iOS and Android and
 * a typed `HH:MM` on a desk, with the device's own 12- or 24-hour reading of it; rolling a
 * time picker by hand would be this app's taste rather than the owner's clock. Its value is
 * translated to and from minutes since midnight in `lib/format.ts`, which is the one place
 * the two clocks meet.
 *
 * **A day is chosen; the pair is committed.** Tapping a day moves the selection and leaves
 * the card open, because the next thing the owner usually wants is the time — a `done` that
 * closed on the day would make them reopen it. `done` is what hands the moment back, and
 * closing any other way (the ✕, the scrim, Escape) throws the draft away, so the sheet behind
 * can never be changed by a mistaken tap.
 *
 * **Forward is closed, not merely greyed.** The right chevron and every day after today are
 * disabled at the current month: an expense cannot have happened tomorrow, and offering the
 * day would only invite a typo to land in the future. Backwards is unbounded, because the
 * owner's history is. `now` puts both halves back on the current moment.
 *
 * Every control ticks at the light weight. There is no confirming thud here — the moment is
 * chosen, not committed; the sheet's own **Add Record** is where the thud lives.
 */
const SPRING = { type: "spring", stiffness: 420, damping: 32 } as const
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]
const DAY = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric" })

export type DateDialogProps = {
  isOpen: boolean
  /** The moment the sheet is on: the day it is filed on and the time of day it carries. */
  value: number
  /** The moment the sheet was opened, which is the latest day it may offer. */
  now: number
  onClose: () => void
  /** The chosen moment, as epoch ms. */
  onPick: (at: number) => void
}

export function DateDialog({ isOpen, value, now, onClose, onPick }: DateDialogProps) {
  // The card opens on the month, day and time the pill is showing, every time it is opened.
  // The reset is done during render (React's own rule for state a changed prop invalidates):
  // an effect would paint the previous draft for a frame before snapping to this one.
  const [month, setMonth] = useState(() => startOfMonth(value))
  const [day, setDay] = useState(() => startOfDay(value))
  const [minutes, setMinutes] = useState(() => minutesOfDay(value))
  const [wasOpen, setWasOpen] = useState(false)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) {
      setMonth(startOfMonth(value))
      setDay(startOfDay(value))
      setMinutes(minutesOfDay(value))
    }
  }

  useEffect(() => {
    if (!isOpen) return
    /*
     * On **`document`, in the capture phase**, and the propagation stops here: the sheet
     * underneath listens for Escape on `window` (its bubble phase), which runs last of all —
     * so a listener on `window` here would lose the race and an Escape meant to close this
     * card would also throw away the amount being typed behind it. Catching the event on its
     * way down, one node above everything, is what makes the card the only thing it closes.
     */
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.stopPropagation()
      onClose()
    }
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  }, [isOpen, onClose])

  const thisMonth = startOfMonth(now)
  const today = startOfDay(now)
  const atLatestMonth = startOfMonth(month) >= thisMonth

  const first = new Date(startOfMonth(month))
  const lead = (first.getDay() + 6) % 7 // Monday-first, like the heatmap
  const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const days = Array.from({ length }, (_, index) => addDays(first.getTime(), index))

  const choose = (picked: number) => {
    lightTap()
    setDay(picked)
  }

  /** The draft the card is showing: a day and a time, put together the way a row is filed. */
  const chosen = momentOn(day, minutes)

  const confirm = () => {
    lightTap()
    onPick(chosen)
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
              aria-label="Date and time"
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
                  aria-label="Close without changing the date or time"
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
                {days.map((each) => {
                  const future = each > today
                  const selected = sameDay(each, day)
                  return (
                    <button
                      key={each}
                      type="button"
                      disabled={future}
                      aria-pressed={selected}
                      aria-label={DAY.format(each)}
                      onClick={() => choose(each)}
                      className={join(
                        "grid h-9 place-items-center rounded-xl font-sans text-[13px] leading-4 tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-25",
                        selected
                          ? "border border-sage bg-sage font-medium text-on-sage"
                          : "border border-transparent text-ink hover:bg-line",
                        !selected && sameDay(each, today) && "border-sage text-sage",
                      )}
                    >
                      {new Date(each).getDate()}
                    </button>
                  )
                })}
              </div>

              {/*
                The clock. The italic label says what the field is rather than naming the
                format, because the field already speaks the device's own — 24-hour here, 12
                with a meridiem on an iPhone set to one. `now` is the same prescription as the
                old `today` pill, for both halves at once.
              */}
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
                <label htmlFor="entry-time" className="font-editorial text-[12px] leading-4 italic text-ink2">
                  at
                </label>
                <input
                  id="entry-time"
                  type="time"
                  value={timeFieldValue(minutes)}
                  onChange={(event) => {
                    const parsed = parseTimeField(event.target.value)
                    if (parsed === null) return
                    lightTap()
                    setMinutes(parsed)
                  }}
                  className="h-9 w-28 rounded-xl border border-line bg-canvas px-2 text-center font-sans text-[13px] leading-4 font-medium tabular-nums text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
                />
                <button
                  type="button"
                  onClick={() => {
                    lightTap()
                    setMonth(startOfMonth(now))
                    setDay(today)
                    setMinutes(minutesOfDay(now))
                  }}
                  className="h-9 flex-none rounded-2xl border border-sage bg-transparent px-3 font-sans text-[12px] leading-4 font-medium tracking-wide-tag text-sage outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  now
                </button>
              </div>

              <button
                type="button"
                onClick={confirm}
                className="mt-2 h-11 w-full rounded-2xl border-0 bg-sage px-4 font-sans text-[13px] leading-5 font-medium tracking-[0.02em] text-on-sage outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                done
              </button>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
