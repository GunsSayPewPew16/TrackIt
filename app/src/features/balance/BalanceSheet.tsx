import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import { useEffect } from "react"

import { Keypad } from "@/features/manual-entry/Keypad"
import { formatRaw, rawFromCents, useAmountInput } from "@/features/manual-entry/useAmountInput"
import { heavyThud, mediumClick, primeHaptics } from "@/lib/haptics"

/**
 * The balance editor: what one account holds, typed by the owner.
 *
 * It exists because a card's figure is *derived* — the import's opening, plus income, minus
 * expenses (`lib/derive.ts`) — and the derivation can only be as right as the history behind
 * it. A cash withdrawal nobody logged, a split bill, a month that predates the export: the
 * card is then a number the owner knows is wrong and has no way to correct. So a long press
 * on the front card opens this, the manual entry's own keypad types the figure, and what is
 * stored is the opening that makes the card read it (`lib/balances.ts`) — the card keeps
 * moving with the ledger from that moment on rather than freezing at a typed number.
 *
 * **One panel, the app's own vocabulary.** The surface is the budget editor's to the pixel:
 * the same 28px top radius, the same 380/32/0.8 spring, the same dim layer, the same 48px
 * sage confirm and the same ₹-marked figure in the display face. It edits one number, so it
 * takes only the room the number and its keypad need, and the card being changed stays
 * visible above it.
 *
 * The save is a **45ms thud**, like every other write in the app; closing is a 20ms click.
 */

const SPRING = { type: "spring", stiffness: 380, damping: 32, mass: 0.8 } as const

export type BalanceSheetProps = {
  isOpen: boolean
  /** The account being edited, by the name the card prints: `UPI`. */
  name: string
  /** What the card reads now, in integer paise. Read even while closing, so it must not be `null`. */
  balanceCents: number
  onClose: () => void
  /** The new balance, in integer paise. */
  onSave: (cents: number) => void
}

export function BalanceSheet({ isOpen, name, balanceCents, onClose, onSave }: BalanceSheetProps) {
  const { raw, value, press, reset } = useAmountInput()

  /** Every open starts on the figure the card is showing, including a second open in a row. */
  useEffect(() => {
    if (isOpen) reset(rawFromCents(balanceCents))
  }, [isOpen, balanceCents, reset])

  useEffect(() => {
    if (!isOpen) return
    // Laid out before the first key: iOS only ticks for a control the document has laid out,
    // and this panel is opened by a hold rather than by the control the thumb touches next.
    primeHaptics()
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
            aria-label={`${name} balance`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SPRING}
            className="fixed inset-x-0 bottom-0 z-[55] mx-auto w-full max-w-[390px] rounded-t-[28px] border-t border-line bg-card px-4 pt-4"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-editorial text-[18px] leading-7 italic text-ink">
                  {name} balance
                </h2>
                <p className="mt-1 text-[11px] leading-4 text-ink2">
                  What this account holds today. The ledger keeps moving it from here.
                </p>
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
              <span className="font-display text-2xl leading-8 text-sage" aria-hidden="true">
                ₹
              </span>
              <span className="font-display text-[40px] leading-[48px] font-bold tracking-[-0.03em] tabular-nums text-ink">
                {formatRaw(raw)}
              </span>
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
              Save balance
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
