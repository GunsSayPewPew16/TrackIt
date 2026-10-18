import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import { useLayoutEffect, useRef, useState, type PointerEventHandler } from "react"

import { ACCOUNTS } from "@/lib/accounts"
import { join } from "@/lib/classes"
import { heavyThud, lightTap } from "@/lib/haptics"
import { CategoryMatrix } from "./CategoryMatrix"
import { Keypad } from "./Keypad"
import type { ManualEntry } from "./types"
import { formatRaw, useAmountInput } from "./useAmountInput"

const SPRING = { type: "spring", stiffness: 380, damping: 32, mass: 0.8 } as const

const collapse = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1 },
  exit: { height: 0, opacity: 0 },
} as const

interface ManualEntryScreenProps {
  /**
   * The category the entry starts on: a quick-log chip's own envelope, or `null` when the
   * sheet was opened from the add-record pill. The mosaic reads it like any other choice,
   * so a preset `restaurant` opens the closed row on *Food & Beverages • Restaurants*.
   */
  initialCategory?: string | null
  onClose: () => void
  onSubmit?: (entry: ManualEntry) => void
  /** Wired by the sheet so a drag that starts on the header can dismiss it. */
  onHeaderPointerDown?: PointerEventHandler
}

/**
 * One hairline-ruled journal line.
 *
 * The placeholder is the **editorial** serif in italic at 40% — it is a prompt, not
 * content — and the moment a character arrives the input switches to the upright
 * structural sans at full ink. That switch is a state decision (`value !== ""`), not a
 * CSS `:placeholder-shown` trick, because it is the *typed* line that has to change
 * face while it is still focused, and a browser only re-evaluates the pseudo-element
 * when the field empties.
 */
function JournalLine({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  const typed = value.length > 0
  return (
    <div className="border-b border-line transition-colors focus-within:border-sage">
      <input
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className={join(
          "h-12 w-full bg-transparent text-[15px] leading-6 text-ink outline-none",
          typed
            ? "font-sans font-normal not-italic"
            : "font-editorial italic placeholder:text-ink2 placeholder:opacity-60",
        )}
      />
    </div>
  )
}

/**
 * The manual entry view: the amount canvas, the account tray, the two journal lines,
 * the category mosaic, and the keypad.
 *
 * **The amount is the one hero.** 56px of Neue Haas Grotesk Display Bold at
 * `tracking-tight-hero`, with the rupee mark lifted into a superscript of its own —
 * 24px, high-desert clay, sitting on the top-left of the figure rather than in its
 * baseline. Long amounts step down in size (56 → 44 → 36) instead of wrapping or
 * clipping, which is the only thing on this screen that is arithmetic rather than design.
 *
 * **The keypad and the mosaic share the room.** Opening the category matrix collapses
 * the journal lines and slides the keypad out of view; picking a category or closing the
 * mosaic brings them back. The amount stays on screen throughout, because it is the
 * thing being edited and the sheet is not a wizard.
 */
export function ManualEntryScreen({
  initialCategory = null,
  onClose,
  onSubmit,
  onHeaderPointerDown,
}: ManualEntryScreenProps) {
  const { raw, value, press, reset } = useAmountInput()
  const [account, setAccount] = useState(ACCOUNTS[0].id)
  const [merchant, setMerchant] = useState("")
  const [note, setNote] = useState("")
  const [category, setCategory] = useState<string | null>(initialCategory)
  const [expanded, setExpanded] = useState(false)
  /**
   * How tall the category panel is allowed to be: the sheet's column, less the account
   * tray and the one gap above the panel. Measured rather than guessed, because the
   * mosaic's height is what the whole expansion animates to and a hard-coded number
   * would drift with the safe-area inset and the height of the phone.
   */
  const [panelRoom, setPanelRoom] = useState(0)
  const column = useRef<HTMLDivElement>(null)
  const tray = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = column.current
    if (!el) return
    const measure = () => {
      const trayHeight = tray.current?.offsetHeight ?? 0
      setPanelRoom(Math.max(0, el.clientHeight - trayHeight - 8))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const text = formatRaw(raw)
  const digitSize = text.length <= 8 ? 56 : text.length <= 11 ? 44 : 36

  const confirm = () => {
    if (value <= 0) return
    heavyThud() // 45ms, and only here
    onSubmit?.({ amount: value, account, merchant: merchant.trim(), note: note.trim(), category })
    reset()
    setMerchant("")
    setNote("")
    setCategory(null)
    onClose()
  }

  return (
    <div className="flex h-dvh flex-col bg-canvas pb-[max(1rem,env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] text-ink">
      {/* The amount canvas: open space, and the header strip is the sheet's drag handle. */}
      <section className="relative h-[35%] min-h-48 shrink-0">
        <header
          onPointerDown={onHeaderPointerDown}
          className="absolute inset-x-0 top-0 flex h-14 cursor-grab touch-none items-center justify-between px-4"
        >
          <span aria-hidden="true" className="absolute left-1/2 top-2 h-1 w-9 -translate-x-1/2 rounded-full bg-line" />
          {/* The sheet's title, at the editorial serif's reading size — 18px, one step up
              the ladder from the 15px captions the same face sets elsewhere. */}
          <span className="font-editorial text-[18px] leading-7 italic text-ink2">New expense</span>
          <button
            type="button"
            aria-label="Close"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              lightTap()
              onClose()
            }}
            className="grid size-12 place-items-center rounded-full border-0 bg-transparent p-0 text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            <X strokeWidth={1.5} className="size-6" aria-hidden="true" />
          </button>
        </header>

        <p
          role="status"
          aria-label={`Amount ${text} rupees`}
          className="absolute bottom-6 left-4 flex items-start font-display font-bold"
        >
          <span
            aria-hidden="true"
            className="mr-1 font-sans text-2xl leading-none font-medium tracking-normal text-clay"
            style={{ marginTop: digitSize * 0.12 }}
          >
            ₹
          </span>
          <motion.span
            aria-hidden="true"
            key={text.length /* a quick settle each time a digit arrives */}
            initial={{ opacity: 0.6, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className={join("leading-none tracking-tight-hero", raw ? "text-ink" : "text-ink2/50")}
            // The tracking is on the figure itself, not the row: an `em` resolved on a
            // 13px parent would compute to −0.5px and the 56px digits would inherit the
            // number rather than the ratio.
            style={{ fontSize: digitSize }}
          >
            {text}
          </motion.span>
        </p>
      </section>

      <div ref={column} className="relative flex min-h-0 flex-1 flex-col gap-2 px-4">
        {/* The account tray: one segmented control, the same 48px row on every phone. */}
        <div
          ref={tray}
          role="radiogroup"
          aria-label="Account"
          className="grid shrink-0 grid-cols-2 gap-0 rounded-[20px] border border-line bg-card p-1"
        >
          {ACCOUNTS.map((entry) => {
            const active = entry.id === account
            return (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  lightTap()
                  setAccount(entry.id)
                }}
                className={join(
                  "relative h-12 rounded-2xl border-0 bg-transparent px-1 font-sans text-[12px] leading-4 font-medium tracking-wide-tag outline-none focus-visible:ring-2 focus-visible:ring-ink",
                  active ? "text-ink" : "text-ink2",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="accountSelector"
                    transition={SPRING}
                    className="absolute inset-0 rounded-2xl bg-canvas"
                  />
                )}
                <span className="relative z-10">{entry.name}</span>
              </button>
            )
          })}
        </div>

        {/*
          The journal lines, hidden while the mosaic needs their room.

          They stay in the flow on purpose. The two lines are the 92px the panel travels
          upward on its way open: the panel is the column's last item, so as the lines
          collapse the panel's top edge rises with them while its own height animation
          pushes the bottom edge down. That is the whole expansion in two layout
          numbers, with no shared-layout projection — a morph of that kind scales the
          mosaic's type non-uniformly for half a second, which is what made the tiles look
          smeared on the way in.
        */}
        <AnimatePresence initial={false}>
          {!expanded && (
            <motion.div key="journal" {...collapse} transition={SPRING} className="overflow-hidden">
              <JournalLine label="Merchant" value={merchant} onChange={setMerchant} placeholder="Who did you pay?..." />
              <JournalLine label="Notes" value={note} onChange={setNote} placeholder="What did you purchase?..." />
            </motion.div>
          )}
        </AnimatePresence>

        <CategoryMatrix
          value={category}
          expanded={expanded}
          room={panelRoom}
          onExpand={() => setExpanded(true)}
          onCollapse={() => setExpanded(false)}
          onSelect={setCategory}
        />

        {/*
          The keypad and the confirm leave the room while the mosaic is open.

          `popLayout` is what makes the panel's opening one motion instead of two. An
          exiting child normally stays in the flow for the whole of its exit, so the
          keypad would keep its 248px for 400ms while the mosaic was trying to grow into
          them: the panel grew part of the way, stalled, then jumped the last 265px in a
          single frame when the exit finished. `popLayout` measures the leaving child and
          places it absolutely at once, so the column's free space is the full room from
          the first frame and the panel animates into it in one movement. The panel is
          given a stacking context above it, so the keypad sliding away is never drawn
          over the mosaic that is replacing it.
        */}
        <AnimatePresence initial={false} mode="popLayout">
          {!expanded && (
            <motion.div
              key="pad"
              initial={{ opacity: 0, y: 48 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 48 }}
              transition={SPRING}
              className="mt-auto flex shrink-0 flex-col gap-2"
            >
              <Keypad onKey={press} />
              <button
                type="button"
                onClick={confirm}
                disabled={value <= 0}
                className="h-12 w-full rounded-2xl border-0 bg-sage px-4 font-sans text-[14px] leading-5 font-medium tracking-[0.02em] text-on-sage outline-none transition-opacity disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ink"
              >
                add record
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
