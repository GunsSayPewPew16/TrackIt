import { AnimatePresence, motion, useDragControls } from "framer-motion"
import { useEffect } from "react"

import { mediumClick } from "@/lib/haptics"
import { ManualEntryScreen } from "./ManualEntryScreen"
import type { SheetProps } from "./types"

/**
 * The manual entry view as a full-screen sheet over the app.
 *
 * It arrives from the bottom boundary (`y: "100%"` → `0`) on one spring —
 * stiffness 380, damping 32, mass 0.8 — which is quick enough to feel attached to
 * the tap and heavy enough not to snap. The header is the only drag handle: pulling
 * it down moves the whole sheet with the finger, and past **150px** the sheet is
 * animated off screen and `onClose` fires. Under that it springs back, because a
 * thumb that brushed the header did not mean to throw away a half-typed amount.
 *
 * The dim layer is the app's own canvas at 40%, so the dashboard recedes rather than
 * turning black; tapping it closes the sheet, as does Escape. While the sheet is open
 * the page behind it is locked, which is what keeps iOS from scrolling the dashboard
 * under a finger that is aiming at the keypad.
 */
const SPRING = { type: "spring", stiffness: 380, damping: 32, mass: 0.8 } as const
const DISMISS_DISTANCE = 150

export function ManualEntrySheet({ isOpen, category, payee, onClose, onSubmit }: SheetProps) {
  const controls = useDragControls()

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
            key="sheet"
            role="dialog"
            aria-modal="true"
            // The same sheet, named for what it does: a scanned code's open is a payment.
            aria-label={payee ? "Pay and log transaction" : "Manual expense entry"}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SPRING}
            drag="y"
            dragListener={false} // only the header starts a drag
            dragControls={controls}
            dragDirectionLock
            dragSnapToOrigin
            dragConstraints={{ top: 0, bottom: 800 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > DISMISS_DISTANCE) {
                mediumClick()
                onClose()
              }
            }}
            className="fixed inset-0 z-[55] mx-auto w-full max-w-[390px] overflow-hidden bg-canvas"
          >
            <ManualEntryScreen
              // Seeded per open: the screen unmounts with the sheet, so a chip's category
              // is what the next open starts on and the add-record pill's `null` clears it.
              initialCategory={category ?? null}
              // A scanned payee turns the same screen into the payment screen — see
              // `SheetProps.payee`. It also seeds the keypad when the code carried an
              // amount, so a printed figure is confirmed rather than retyped.
              payee={payee ?? null}
              onClose={onClose}
              onSubmit={onSubmit}
              onHeaderPointerDown={(event) => controls.start(event)}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
