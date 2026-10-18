import { AnimatePresence, motion } from "framer-motion"
import { Check, ChevronRight, X } from "lucide-react"
import { useEffect, useState } from "react"

import { Keypad } from "@/features/manual-entry/Keypad"
import { formatRaw, rawFromCents, useAmountInput } from "@/features/manual-entry/useAmountInput"
import { BUDGET_COPY, type BudgetScope } from "@/lib/budget"
import { CATEGORY_GROUPS, categoryFor } from "@/lib/categories"
import { join } from "@/lib/classes"
import { wholeMoney } from "@/lib/format"
import { heavyThud, lightTap, mediumClick, primeHaptics } from "@/lib/haptics"

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
 * **It has two pages, and the second one is what the budget counts.** The row under the
 * figure — *Tracking · 4 categories* — opens the picker: every category the app knows,
 * grouped exactly as Wallet paints them, each one a chip that is in or out. A budget that
 * counts only Groceries and Restaurants is a real budget, and so is one that counts nothing;
 * because **every toggle is written at once** (`setBudgetTracked`, `lib/budget.ts`) rather
 * than staged behind a save button, the card behind the panel moves on the frame the chip
 * changes. The card itself is usually below the fold by then, so the picker also carries the
 * month's own figure — spent against the limit — and it re-reads on every toggle: the answer
 * to "what does that do?" is a number the owner watches move, not a caption.
 *
 * The save is a **45ms thud**, the same weight as confirming an entry: both write something
 * the owner will live with. Cancelling is a 20ms click rather than a thud, because it did
 * not write anything; a toggle is a 20ms click too, because what it writes is one id.
 */

const SPRING = { type: "spring", stiffness: 380, damping: 32, mass: 0.8 } as const

/**
 * Every category a budget may count, in Wallet's own groups and order: each group's own row
 * first, then its children.
 *
 * Wallet's plumbing is left out — `system` categories ("Transfer, withdraw", the OneClick
 * record, "Automatic bank statements reading") are renderable on a card and are never
 * spending, so they are not something to budget against. It is the same rule the manual
 * entry's mosaic follows.
 */
const GROUPS = CATEGORY_GROUPS.map((group) => ({
  id: group.id,
  label: group.label,
  color: group.color,
  categories: group.categories.filter((id) => categoryFor(id).system !== true),
}))

export type BudgetSheetProps = {
  isOpen: boolean
  /** Which budget is being edited. Read even while closing, so it must not be `null`. */
  scope: BudgetScope
  /** The limit on screen when it opened, in integer paise. */
  limitCents: number
  /** What the budget counts today: category ids, or `null` for every expense. */
  tracked: string[] | null
  /**
   * What this budget has counted this month, in integer paise, as the card behind derives it.
   * It is handed in rather than summed here because the rows live in the app, and it is what
   * makes the picker's figure move on the same frame a chip does.
   */
  spentCents: number
  onClose: () => void
  /** The new limit, in integer paise. */
  onSave: (cents: number) => void
  /** Every toggle, written straight through so the card behind the panel keeps up. */
  onTrack: (categories: string[] | null) => void
}

/**
 * One chip: a category that counts, or does not.
 *
 * The same capsule the dashboard's envelope card prints its subcategories in, because it
 * answers the same question — "is this part of the budget?" — and the owner already reads
 * that shape as a category. Selected is the sage fill; unselected is the hairline, in the
 * quieter ink, with no fill at all.
 */
function Chip({
  label,
  selected,
  onToggle,
}: {
  label: string
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={() => {
        lightTap() // must run synchronously inside the tap for iOS
        onToggle()
      }}
      className={join(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2xl px-3 font-sans text-[11px] leading-4 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ink",
        selected ? "border-0 bg-sage font-medium text-on-sage" : "border border-line text-ink2",
      )}
    >
      {selected && <Check strokeWidth={2} className="size-3" aria-hidden="true" />}
      {label}
    </button>
  )
}

export function BudgetSheet({
  isOpen,
  scope,
  limitCents,
  tracked,
  spentCents,
  onClose,
  onSave,
  onTrack,
}: BudgetSheetProps) {
  const { raw, value, press, reset } = useAmountInput()
  const copy = BUDGET_COPY[scope]
  /** Which of the panel's two pages is showing: the figure, or what it counts. */
  const [view, setView] = useState<"limit" | "tracking">("limit")
  /**
   * Every open starts on the limit page, because that is the page the card's own figure is
   * about. The reset happens **during render**, on the open's first pass, rather than in an
   * effect: an effect would draw the picker for one frame on a second open, which is exactly
   * the flicker the app spends its springs avoiding.
   */
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen)
    if (isOpen) setView("limit")
  }

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
    /*
     * Have the haptic switch laid out before the first key is pressed. iOS only plays a
     * tick for a control the document has actually laid out, and this panel is opened by a
     * long press rather than by a control the owner touches next — so the one frame the
     * switch would have cost is spent here, inside the gesture, rather than on the first
     * digit.
     */
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
    if (value <= 0) return
    heavyThud()
    onSave(Math.round(value * 100))
  }

  /** One id in or out of the tracked set. `null` (every expense) becomes a list on the first tap. */
  const toggle = (id: string) => {
    const current = tracked ?? []
    const next = current.includes(id) ? current.filter((held) => held !== id) : [...current, id]
    onTrack(next)
  }

  const trackedLabel =
    tracked === null
      ? "Every expense"
      : tracked.length === 0
        ? "Nothing yet"
        : `${tracked.length} ${tracked.length === 1 ? "category" : "categories"}`

  /** The picker's own readout: how full the month is with the chips as they stand. */
  const spentPct = limitCents > 0 ? Math.min(100, Math.round((spentCents / limitCents) * 100)) : 0

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
            aria-label={view === "limit" ? copy.title : `${copy.label}: what counts`}
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
                  {view === "limit" ? copy.title : "What this budget counts"}
                </h2>
                <p className="mt-1 text-[11px] leading-4 text-ink2">
                  {view === "limit"
                    ? copy.blurb
                    : "Only rows filed under a chosen category count against the limit. The figure below moves as you choose."}
                </p>
              </div>
              <button
                type="button"
                aria-label={view === "limit" ? "Close without saving" : "Back to the limit"}
                onClick={() => {
                  mediumClick()
                  if (view === "limit") onClose()
                  else setView("limit")
                }}
                className="grid size-10 flex-none place-items-center rounded-2xl border border-line bg-transparent text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                {view === "limit" ? (
                  <X strokeWidth={1.5} className="size-5" aria-hidden="true" />
                ) : (
                  <ChevronRight strokeWidth={1.5} className="size-5 rotate-180" aria-hidden="true" />
                )}
              </button>
            </div>

            {/*
              The picker's own two figures, on the same frame as the chips: with the card
              behind the panel usually out of view, this is where a toggle is *seen* to work.
              `aria-live` so a screen reader hears the month move too.
            */}
            {view === "tracking" && (
              <div
                className="mt-3 flex items-baseline gap-2 rounded-2xl border border-line px-3 py-2"
                aria-live="polite"
              >
                <span className="font-display text-xl leading-7 font-bold tabular-nums text-ink">
                  {wholeMoney(spentCents)}
                </span>
                <span className="text-[11px] leading-4 text-ink2">
                  of {wholeMoney(limitCents)} this month · {spentPct}% used
                </span>
              </div>
            )}

            {view === "limit" ? (
              <>
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

                {/*
                  The second question, on one line: what the limit is measured against. It is a
                  row rather than a section because the panel is a figure and its keypad, and a
                  list of every category wedged under them would push the keypad off a short
                  phone — the picker is a page of its own, one tap away, and it says what the
                  budget currently counts while it is closed.
                */}
                <button
                  type="button"
                  onClick={() => {
                    lightTap()
                    setView("tracking")
                  }}
                  className="mt-3 flex h-12 w-full items-center justify-between gap-3 rounded-2xl border border-line bg-transparent px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[10px] leading-3 font-bold tracking-[0.03em] text-ink2 uppercase">
                      Tracking
                    </span>
                    <span className="truncate text-[13px] leading-5 text-ink">{trackedLabel}</span>
                  </span>
                  <ChevronRight strokeWidth={1.5} className="size-4 flex-none text-ink2" aria-hidden="true" />
                </button>

                <div className="mt-3">
                  <Keypad onKey={press} />
                </div>

                {/* `transition-opacity` for the disabled state; the ink switches with the page. */}
                <button
                  type="button"
                  onClick={save}
                  disabled={value <= 0}
                  className="mt-2 h-12 w-full rounded-2xl border-0 bg-sage px-4 font-sans text-[14px] leading-5 font-medium tracking-[0.02em] text-on-sage outline-none transition-opacity disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ink"
                >
                  save budget
                </button>
              </>
            ) : (
              <>
                {/* The page's own height: the groups are many and the phone is not, so it scrolls. */}
                <div className="mt-3 max-h-[52dvh] space-y-4 overflow-y-auto overscroll-contain pr-1">
                  {scope === "total" && (
                    <div className="flex flex-wrap gap-2">
                      <Chip
                        label="Every expense"
                        selected={tracked === null}
                        onToggle={() => onTrack(null)}
                      />
                    </div>
                  )}
                  {GROUPS.map((group) => (
                    <div key={group.id}>
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="size-2 shrink-0 rounded-xs"
                          style={{ background: group.color }}
                        />
                        <span className="text-[10px] leading-4 font-bold tracking-[0.03em] text-ink2 uppercase">
                          {group.label}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {group.categories.map((id) => (
                          <Chip
                            key={id}
                            label={categoryFor(id).label}
                            selected={tracked?.includes(id) ?? false}
                            onToggle={() => toggle(id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    mediumClick()
                    setView("limit")
                  }}
                  className="mt-3 h-12 w-full rounded-2xl border border-line bg-transparent px-4 font-sans text-[14px] leading-5 font-medium tracking-[0.02em] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  Done
                </button>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
