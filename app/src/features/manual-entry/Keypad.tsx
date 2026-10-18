import { motion } from "framer-motion"
import { Delete } from "lucide-react"

import { lightTap, mediumClick } from "@/lib/haptics"

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const
const SPRING = { type: "spring", stiffness: 380, damping: 32, mass: 0.8 } as const

/**
 * The 3×4 keypad: borderless 48px targets, and a different weight under the thumb for
 * each kind of key. Digits tick at 8ms; the decimal point and backspace click at 20ms,
 * because they change the line rather than add to it. Everything is fired inside the
 * press, which is the only place iOS will play it.
 */
export function Keypad({ onKey }: { onKey: (key: string) => void }) {
  return (
    <div role="group" aria-label="Amount keypad" className="grid grid-cols-3">
      {KEYS.map((key) => (
        <motion.button
          key={key}
          type="button"
          aria-label={key === "back" ? "Backspace" : key === "." ? "Decimal point" : key}
          whileTap={{ scale: 0.9, opacity: 0.6 }}
          transition={SPRING}
          onClick={() => {
            if (key === "." || key === "back") mediumClick()
            else lightTap()
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
