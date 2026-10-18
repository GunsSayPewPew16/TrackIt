import { motion } from "framer-motion"
import { Delete } from "lucide-react"

import { lightTap, mediumClick } from "@/lib/haptics"

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const
const SPRING = { type: "spring", stiffness: 380, damping: 32, mass: 0.8 } as const

/**
 * The 3×4 keypad: borderless 48px targets, and a different weight under the thumb for
 * each kind of key. Digits tick at 8ms; the decimal point and backspace click at 20ms,
 * because they change the line rather than add to it.
 *
 * **The tick plays on `pointerdown`, not on `click`.** It is the first moment of a
 * gesture, which is the moment `lib/haptics.ts` needs — iOS drops a scripted tick that
 * arrives outside one — and it is also the moment the thumb expects it. A `click`
 * handler was the only place it used to fire, and a click is the *last* thing that
 * happens: any re-render between the touch and the release could swallow it, which is
 * how the budget editor's keypad came to feel dead while this one did not. The two
 * sheets share this component, so both now tick from the same press.
 *
 * A key pressed from the keyboard has no pointer, so `click` still ticks for it —
 * `detail === 0` is the browser's own mark for that activation, and it is what keeps a
 * key pressed from the keyboard indistinguishable from one pressed with a thumb.
 */
export function Keypad({ onKey }: { onKey: (key: string) => void }) {
  const tick = (key: string) => {
    if (key === "." || key === "back") mediumClick()
    else lightTap()
  }

  return (
    <div role="group" aria-label="Amount keypad" className="grid grid-cols-3">
      {KEYS.map((key) => (
        <motion.button
          key={key}
          type="button"
          aria-label={key === "back" ? "Backspace" : key === "." ? "Decimal point" : key}
          whileTap={{ scale: 0.9, opacity: 0.6 }}
          transition={SPRING}
          onPointerDown={(event) => {
            // A right-click is not a press of this key.
            if (event.pointerType === "mouse" && event.button !== 0) return
            tick(key)
          }}
          onClick={(event) => {
            if (event.detail === 0) tick(key)
            onKey(key)
          }}
          className="grid h-12 min-w-12 place-items-center rounded-2xl font-sans text-xl leading-6 font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          {key === "back" ? <Delete strokeWidth={1.5} className="size-6" aria-hidden="true" /> : key}
        </motion.button>
      ))}
    </div>
  )
}
