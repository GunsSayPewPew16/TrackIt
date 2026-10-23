import { motion } from "framer-motion"
import { Delete } from "lucide-react"

import { keyClick } from "@/lib/keyclick"
import { lightTap, mediumClick } from "@/lib/haptics"

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const

/**
 * The keypad's own physics, separate from the sheet's: a key answers a thumb inside 100ms or
 * it feels broken, so its compression is a stiff 600/15 spring rather than the sheet's softer
 * 400/34. The key is back where it started long before the finger has left.
 */
const KEY = { type: "spring", stiffness: 600, damping: 15 } as const

/**
 * The 3×4 keypad, in its own bento card.
 *
 * **One surface, twelve cells, hairlines between them.** The keys are not twelve floating
 * buttons any more: they are one card (`rounded-[20px]`, `bg-card`, a 1px `border-line`) laid
 * out as a grid whose `gap-px` exposes the card's own `bg-line` as the partition between
 * neighbours. That is one element's background doing the work of eleven dividers — no
 * `divide-x`/`divide-y` on a rAF-animating grid, no double lines where four cells meet, and
 * the outer edge stays a single hairline because the card's own border is the outermost
 * thing. Every cell is 48px in both directions, which is the touch target the app holds
 * everywhere else and the reason the card is 195px tall rather than the 192 a bare grid of
 * 48s would be.
 *
 * **Digits are the display face at 20px.** They are figures, and the display cut is the one
 * the money on the canvas above them is set in — a keypad in the reading face would look like
 * a paragraph of numbers. Stroke weights are uniform (1.5) because the backspace glyph is the
 * only drawing here and it has to sit beside them without announcing itself.
 *
 * **The tick plays on `pointerdown`, not on `click`.** It is the first moment of a gesture,
 * which is the moment `lib/haptics.ts` needs — iOS drops a scripted tick that arrives outside
 * one — and it is also the moment the thumb expects it. A `click` handler was the only place
 * it used to fire, and a click is the *last* thing that happens: any re-render between the
 * touch and the release could swallow it, which is how the budget editor's keypad came to feel
 * dead while this one did not. The two sheets share this component, so both now tick from the
 * same press. A key pressed from the keyboard has no pointer, so `click` still ticks for it —
 * `detail === 0` is the browser's own mark for that activation.
 *
 * **Its press is a tint, not a colour.** `whileTap` compresses the key and the `active:` layer
 * mixes 6% of the page's own ink into it, so the pressed state is a shade of whatever palette
 * is on (a light card in dark, a dark card in light) rather than a hard-coded grey that would
 * have to be re-tuned for each of the four.
 */
export function Keypad({ onKey }: { onKey: (key: string) => void }) {
  const tick = (key: string) => {
    if (key === "." || key === "back") mediumClick()
    else lightTap()
    keyClick()
  }

  return (
    <div
      role="group"
      aria-label="Amount keypad"
      className="grid shrink-0 grid-cols-3 gap-px overflow-hidden rounded-[20px] border border-line bg-line"
    >
      {KEYS.map((key) => (
        <motion.button
          key={key}
          type="button"
          aria-label={key === "back" ? "Backspace" : key === "." ? "Decimal point" : key}
          whileHover={{ scale: 0.98 }}
          whileTap={{ scale: 0.94 }}
          transition={KEY}
          onPointerDown={(event) => {
            // A right-click is not a press of this key.
            if (event.pointerType === "mouse" && event.button !== 0) return
            tick(key)
          }}
          onClick={(event) => {
            if (event.detail === 0) tick(key)
            onKey(key)
          }}
          className="grid h-12 min-w-12 place-items-center bg-card font-display text-xl leading-6 font-medium text-ink outline-none active:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink"
        >
          {key === "back" ? <Delete strokeWidth={1.5} className="size-6" aria-hidden="true" /> : key}
        </motion.button>
      ))}
    </div>
  )
}
