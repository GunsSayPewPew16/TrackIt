import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import { useEffect } from "react"

import { Keypad } from "@/features/manual-entry/Keypad"
import { formatRaw, rawFromCents, useAmountInput } from "@/features/manual-entry/useAmountInput"
import { BUDGET_COPY, type BudgetScope } from "@/lib/budget"
import { heavyThud, mediumClick } from "@/lib/haptics"

/**
 * The budget editor, as the app's second sheet.
 *
 * It exists because both budget cards are **the owner's own number** rather than the
 * app's: a long press on either opens this, the keypad is the manual entry's own, and the
 * figure it starts on is the limit the card is drawing. Everything about the surface is
 * the manual entry's vocabulary — the same spring (380/32/0.8), the same 20px radii, the
 * same sage confirm at 48px — because it is the same kind of thing: a figure typed into a
 * panel that rose from the bottom of the screen.
 *
 * **It is a panel, not a screen.** The manual entry takes the whole viewport because it is
 * a place to compose a row; this one edits one number, so it takes only the room the number
 * and its keypad need, and the dim layer above it still shows the card being changed.
 *
 * The save is a **45ms thud**, the same weight as confirming an entry: both write something
 * the owner will live with. Cancelling is a 20ms click rather than a thud, because it did
 * not write anything.
 */
const SPRING = { type: "spring", stiffness: 380, damping: 32, mass: 0.8 } as const

export type BudgetSheetProps = {
  isOpen: boolean
  /** Which budget is being edited. Read even while closing, so it must not be `null`. */
  scope: BudgetScope
  /** The limit on screen when it opened, in integer paise. */
  limitCents: number
  onClose: () => void
  /** The new limit, in integer paise. */
  onSave: (cents: number) => void
}

export function BudgetSheet({ isOpen, scope, limitCents, onClose, onSave }: BudgetSheetProps) {
  const { raw, value, press, reset } = useAmountInput()
  const copy = BUDGET_COPY[scope]

  /**
   * Every open starts on the figure the card is showing — including a second open in the
   * same session, after a save or a cancel changed nothing. It re-seeds if the limit itself
   * changes, which can only be the save that is closing this sheet.
   */
  useEffect(() => {
    if (isOpen) reset(rawFromCents(limitCents))
  }, [isOpen, limitCents, reset])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
    }
  }, [isOpen, onClose])

  const save = () => {
    if (value <= 0) return
    heavyThud()
    onSave(Math.round(value * 100))
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
            className="fixed inset-0 z-50 bg-canvas"
          />

          <motion.div
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label={copy.title}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SPRING}
            className="fixed inset-x-0 bottom-0 z-[55] mx-auto w-full max-w-[390px] rounded-t-[28px] border-t border-line bg-card px-4 pt-4"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-editorial text-[18px] leading-7 italic text-ink">{copy.title}</h2>
                <p className="mt-1 text-[11px] leading-4 text-ink2">{copy.blurb}</p>
              </div>
              <button
                type="button"
                aria-label="Close without saving"
                onClick={() => {
                  mediumClick()
                  onClose()
                }}
                className="grid size-10 flex-none place-items-center rounded-2xl border border-line bg-transparent text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                <X strokeWidth={1.5} className="size-5" aria-hidden="true" />
              </button>
            </div>

            {/* The figure, in the manual entry's own money type. */}
            <div className="mt-3 flex items-baseline gap-1" aria-live="polite">
              <span className="font-display text-2xl leading-8 text-clay" aria-hidden="true">
                ₹
              </span>
              <span className="font-display text-[40px] leading-[48px] font-bold tracking-[-0.03em] tabular-nums text-ink">
                {formatRaw(raw)}
              </span>
              <span className="font-editorial text-xs italic text-ink2">/ month</span>
            </div>

            <div className="mt-3">
              <Keypad onKey={press} />
            </div>

            <button
              type="button"
              onClick={save}
              disabled={value <= 0}
              className="mt-2 h-12 w-full rounded-2xl border-0 bg-sage px-4 font-sans text-[14px] leading-5 font-medium tracking-[0.02em] text-on-sage outline-none transition-opacity disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ink"
            >
              save budget
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
