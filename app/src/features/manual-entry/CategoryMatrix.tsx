import { AnimatePresence, motion } from "framer-motion"
import {
  BookOpen,
  Bus,
  Car,
  Coffee,
  Coins,
  Compass,
  Dumbbell,
  FileText,
  Fuel,
  Gift,
  Hourglass,
  Key,
  Laptop,
  Layers,
  Music4,
  ShieldAlert,
  Shirt,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Tv,
  Utensils,
  Wifi,
  Wine,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { RowIcon } from "@/components/RowIcon"
import { join } from "@/lib/classes"
import { lightTap } from "@/lib/haptics"

/**
 * The category picker: a closed row that unfolds into BudgetBakers' six parent
 * dimensions as an asymmetric bento mosaic, and then unfolds again — per parent —
 * into the sub-categories that actually file the row.
 *
 * **The mosaic is the parent tree.** Food & Beverages and Shopping get the wide 2×1
 * blocks because they are where the money goes; Life & Leisure gets the 2×2 and
 * Investments a compact 1×1. Each tile is its data colour at `--tint-bg` (14% in dark
 * over the card's #1A221E, 10% on white) with a `--tint-border` (35%) hairline; the
 * chosen tile takes a solid border and scales to 0.97 while the rest fade to 0.4.
 *
 * **The pills are the leaves, and they carry the icons.** Tapping a parent both locks
 * it and opens its tray: a wrapped row of icon capsules, the parent's own colour at
 * `--tint-pill` (20% dark, 12% light) with a solid accent border on the one chosen.
 * The tray is a `height: auto` accordion between the mosaic and the panel's edge, so
 * the mosaic gives it the room rather than the sheet growing.
 *
 * **Every pill files under a real Wallet category.** The pill's label is the owner's
 * wording (`Coffee & Cafes`, `Spotify`), but its id is an id from `lib/categories.ts`:
 * a row saved here has to be a row the ledger can total and the icons can draw, and
 * inventing a `coffee` category would be a second tree. Where Wallet has one envelope
 * for two intents — `bar-cafe` is both the coffee shop and the bar, `tv-streaming` is
 * everything you subscribe to, `financial-investments` is both stocks and funds — the
 * two pills share the id and are told apart by `key`. A shared id is honest; a
 * category that does not exist is not.
 */
type Tone = "red" | "gold" | "teal" | "indigo"

type SubCategory = {
  /** Distinguishes two pills that file under the same Wallet envelope. */
  key: string
  /** A category id from `lib/categories.ts` — what the row is filed under. */
  id: string
  /** What the pill says, which is the owner's own wording. */
  label: string
  icon: LucideIcon
}

type MatrixCategory = {
  /** A parent category id from `lib/categories.ts`. */
  id: string
  /** The full name, said back in the closed row. */
  name: string
  /** What the tile writes, which has to fit its block. */
  short: string
  /** Which data colour wash it and its pills wear. */
  tone: Tone
  /** Its place in the 3×4 mosaic. */
  area: string
  children: SubCategory[]
}

const MATRIX: MatrixCategory[] = [
  {
    id: "food-drinks",
    name: "Food & Beverages",
    short: "Food & beverages",
    tone: "red",
    area: "col-span-2",
    children: [
      { key: "groceries", id: "groceries", label: "Groceries", icon: ShoppingCart },
      { key: "restaurants", id: "restaurant", label: "Restaurants", icon: Utensils },
      { key: "coffee", id: "bar-cafe", label: "Coffee & Cafes", icon: Coffee },
      { key: "bar", id: "bar-cafe", label: "Bar & Alcohol", icon: Wine },
    ],
  },
  {
    id: "housing",
    name: "Housing & Utilities",
    short: "Housing",
    tone: "indigo",
    area: "",
    children: [
      { key: "rent", id: "rent", label: "Rent & Mortgage", icon: Key },
      { key: "energy", id: "energy", label: "Electricity/Water", icon: Zap },
      { key: "internet", id: "internet", label: "Internet & Mobile", icon: Wifi },
      { key: "insurance", id: "insurances", label: "Insurance", icon: FileText },
    ],
  },
  {
    id: "shopping",
    name: "Shopping",
    short: "Shopping",
    tone: "red",
    area: "col-span-2",
    children: [
      { key: "clothes", id: "clothes-shoes", label: "Clothes & Shoes", icon: Shirt },
      { key: "electronics", id: "electronics", label: "Electronics", icon: Laptop },
      { key: "gifts", id: "gifts-joy", label: "Gifts & Celebrations", icon: Gift },
      { key: "beauty", id: "health-beauty", label: "Health & Beauty", icon: Sparkles },
    ],
  },
  {
    id: "investments",
    name: "Investments & Savings",
    short: "Investments",
    tone: "gold",
    area: "",
    children: [
      { key: "stocks", id: "financial-investments", label: "Stocks & Crypto", icon: TrendingUp },
      { key: "emergency", id: "savings", label: "Emergency Fund", icon: ShieldAlert },
      { key: "funds", id: "financial-investments", label: "Mutual Funds", icon: Layers },
      { key: "retirement", id: "investments", label: "Retirement", icon: Hourglass },
      { key: "allowance", id: "allowance", label: "Allowance", icon: Coins },
    ],
  },
  {
    id: "life-entertainment",
    name: "Life & Leisure",
    short: "Life & leisure",
    tone: "teal",
    area: "col-span-2 row-span-2",
    children: [
      { key: "streaming", id: "tv-streaming", label: "Movies & Streaming", icon: Tv },
      { key: "spotify", id: "tv-streaming", label: "Spotify", icon: Music4 },
      { key: "gym", id: "active-sport", label: "Gym & Fitness", icon: Dumbbell },
      { key: "books", id: "books-subs", label: "Books & Education", icon: BookOpen },
      { key: "hobbies", id: "hobbies", label: "Hobbies", icon: Compass },
    ],
  },
  {
    id: "transportation",
    name: "Transportation",
    short: "Transport",
    tone: "indigo",
    area: "row-span-2",
    children: [
      { key: "fuel", id: "fuel", label: "Fuel & Petrol", icon: Fuel },
      { key: "transit", id: "public-transport", label: "Public Transit", icon: Bus },
      { key: "taxi", id: "taxi", label: "Taxi & Rideshare", icon: Car },
      { key: "maintenance", id: "vehicle-maintenance", label: "Maintenance", icon: Wrench },
    ],
  },
]

const SPRING = { type: "spring", stiffness: 320, damping: 30 } as const
/** How long a pick stays on screen before the panel folds back to its one row. */
const COLLAPSE_DELAY = 250

const wash = (tone: Tone) => `color-mix(in srgb, var(--data-${tone}) var(--tint-bg), transparent)`
const edge = (tone: Tone) => `color-mix(in srgb, var(--data-${tone}) var(--tint-border), transparent)`
const pillWash = (tone: Tone) => `color-mix(in srgb, var(--data-${tone}) var(--tint-pill), transparent)`

interface CategoryMatrixProps {
  value: string | null
  expanded: boolean
  /** The height the open panel may occupy: the sheet's room for it, measured by the screen. */
  room: number
  onExpand: () => void
  onCollapse: () => void
  onSelect: (id: string) => void
}

export function CategoryMatrix({ value, expanded, room, onExpand, onCollapse, onSelect }: CategoryMatrixProps) {
  const timer = useRef<number | undefined>(undefined)
  /** Which parent's tray is open. One at a time: the mosaic is the switcher. */
  const [open, setOpen] = useState<string | null>(null)
  /**
   * The pill that was actually pressed, when two of them file under the same Wallet
   * envelope. `value` alone is not enough to light the right one — `bar-cafe` is both
   * the coffee shop and the bar — so the key remembers which label the owner picked.
   */
  const [picked, setPicked] = useState<string | null>(null)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const owner = MATRIX.find((parent) => parent.id === value || parent.children.some((child) => child.id === value)) ?? null
  const chosen =
    (picked && owner?.children.find((child) => child.key === picked && child.id === value)) ||
    owner?.children.find((child) => child.id === value) ||
    null

  /** Fold the panel back into its row, a beat after the pick has been read. */
  const scheduleCollapse = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setOpen(null)
      onCollapse()
    }, COLLAPSE_DELAY)
  }

  const openParent = (parent: MatrixCategory) => {
    lightTap()
    setPicked(null)
    setOpen(parent.id)
    // The parent is a category in its own right, so the row is filed the moment the
    // tray opens; a pill in the tray is a refinement of it, not the only way in.
    onSelect(parent.id)
  }

  const pick = (parent: MatrixCategory, child: SubCategory) => {
    lightTap()
    setPicked(child.key)
    onSelect(child.id)
    scheduleCollapse()
  }

  /*
    One surface, two states.

    The row and the open panel used to be two elements sharing a `layoutId`, and the
    morph between them scaled the whole mosaic: tiles were stretched non-uniformly while
    a 400ms cross-fade let the keypad show through the card, and because the exiting
    keypad kept its 248px in the flow the panel grew part of the way, stalled, then
    snapped the last 265px in a single frame. This is instead **one element whose height
    animates** — 56px closed, the sheet's room open — so the header stays put, the mosaic
    is never rescaled, the card is always opaque, and closing is the same movement in
    reverse rather than a swap.

    The top edge still travels upward by the journal lines' height while the panel opens:
    the panel is the column's last item, so the lines collapsing above it carry its top
    with them while its own height pushes the bottom down. `relative z-10` keeps the
    leaving keypad (out of the flow via `popLayout`, but still painted) underneath the
    card that is replacing it.

    Closed, the mosaic is still mounted but `inert` and at zero opacity, so the height
    animation has content to reveal on the first frame; a transparent button over the
    whole 56px card is the tap target, which is what keeps the row's hit area the same as
    when it was a `<button>` itself.
  */
  return (
    <motion.div
      initial={false}
      animate={{ height: expanded ? room || 56 : 56 }}
      transition={SPRING}
      className="relative z-10 flex min-h-0 shrink-0 flex-col overflow-hidden rounded-[20px] border border-line bg-card p-4"
    >
      <div className="flex h-5 shrink-0 items-baseline justify-between gap-3">
        <span className="shrink-0 font-sans text-[13px] leading-4 text-ink">Category</span>
        {expanded ? (
          /*
            The way out of the panel once something is chosen. Opening a tray selects its
            parent, so without this the only exit from the mosaic would be picking a
            sub-category — and the keypad, which is what confirms the entry, comes back
            only when the panel folds.
          */
          value ? (
            <button
              type="button"
              onClick={() => {
                lightTap()
                setOpen(null)
                onCollapse()
              }}
              className="border-0 bg-transparent p-0 font-editorial text-[13px] leading-4 italic text-ink2 outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              Done
            </button>
          ) : (
            <span className="font-editorial text-[13px] leading-4 italic text-ink2">Choose one</span>
          )
        ) : owner ? (
          /* `Parent • Sub` — the parent in the structural sans, the sub in the editorial
             serif's italic at 60%, which is the app's split-font language everywhere else.
             The mark is the pill's own icon when a sub was picked, not the Wallet
             category's: `Coffee & Cafes` and `Bar & Alcohol` share one envelope, so the
             category marker would have drawn a wine glass beside the word coffee. */
          <span className="flex min-w-0 items-center gap-2 text-[13px] leading-4">
            {chosen ? (
              <chosen.icon strokeWidth={1.5} className="size-5 shrink-0" aria-hidden="true" />
            ) : (
              <RowIcon name={owner.id} className="size-5 shrink-0" />
            )}
            <span className="truncate font-sans font-medium text-ink">{owner.name}</span>
            {chosen && (
              <>
                <span aria-hidden="true" className="text-ink2">
                  •
                </span>
                <span className="truncate font-editorial italic text-ink2">{chosen.label}</span>
              </>
            )}
          </span>
        ) : (
          <span className="font-editorial text-[15px] leading-5 italic text-ink2/60">Select category...</span>
        )}
      </div>

      {/* The whole closed card is the way in, exactly as it was when the row was a button. */}
      {!expanded && (
        <button
          type="button"
          aria-expanded={false}
          aria-label={owner ? `Category: ${owner.name}${chosen ? `, ${chosen.label}` : ""}. Change category` : "Choose a category"}
          onClick={() => {
            lightTap()
            onExpand()
          }}
          className="absolute inset-0 z-20 rounded-[20px] outline-none focus-visible:ring-2 focus-visible:ring-ink"
        />
      )}

      <motion.div
        inert={!expanded}
        aria-hidden={!expanded}
        animate={{ opacity: expanded ? 1 : 0 }}
        transition={{ duration: expanded ? 0.18 : 0.1, delay: expanded ? 0.06 : 0 }}
        className="flex min-h-0 flex-1 flex-col gap-2 pt-2"
      >
        <div
          role="group"
          aria-label="Categories"
          className="grid min-h-0 flex-1 grid-cols-3 grid-rows-4 gap-2"
        >
          {MATRIX.map((parent) => {
            const isSelected = owner?.id === parent.id
            const dimmed = value !== null && !isSelected
            return (
              <motion.button
                key={parent.id}
                type="button"
                aria-pressed={isSelected}
                aria-expanded={open === parent.id}
                aria-controls={`category-tray-${parent.id}`}
                onClick={() => openParent(parent)}
                animate={{ scale: isSelected ? 0.97 : 1, opacity: dimmed ? 0.4 : 1 }}
                transition={SPRING}
                style={{
                  backgroundColor: wash(parent.tone),
                  borderColor: isSelected ? `var(--data-${parent.tone})` : edge(parent.tone),
                }}
                className={join(
                  "flex min-h-0 flex-col items-start justify-between overflow-hidden rounded-2xl border p-3 text-left text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink",
                  parent.area,
                )}
              >
                <RowIcon name={parent.id} className="size-5" />
                <span className="max-w-full truncate font-sans text-[12px] leading-4 font-medium tracking-wide-tag">
                  {parent.short}
                </span>
              </motion.button>
            )
          })}
        </div>

        {/* The tray: the open parent's sub-categories, wrapped under the mosaic. */}
        {/*
          `popLayout` takes the tray that is leaving out of the flow, so switching parents
          cannot stack two trays and squeeze the mosaic twice on its way there.
        */}
        <AnimatePresence initial={false} mode="popLayout">
          {MATRIX.filter((parent) => parent.id === open).map((parent) => (
            <motion.div
              key={parent.id}
              id={`category-tray-${parent.id}`}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={SPRING}
              className="shrink-0 overflow-hidden"
            >
              <div role="group" aria-label={`${parent.name} sub-categories`} className="flex flex-wrap gap-1.5 pt-2">
                {parent.children.map((child) => {
                  // The pressed pill when there is one, and the first pill that files under
                  // the chosen id otherwise — which is what a value restored from outside
                  // the tray has to fall back on when two pills share an envelope.
                  const chosenKey = picked ?? parent.children.find((entry) => entry.id === value)?.key
                  const lit = value !== null && chosenKey === child.key
                  const Icon = child.icon
                  return (
                    <motion.button
                      key={child.key}
                      type="button"
                      aria-pressed={lit}
                      whileTap={{ scale: 0.95 }}
                      transition={SPRING}
                      onClick={() => pick(parent, child)}
                      style={{
                        backgroundColor: lit ? pillWash(parent.tone) : "var(--card)",
                        borderColor: lit ? `var(--data-${parent.tone})` : "var(--line)",
                        color: lit ? "var(--tint-pill-ink)" : "var(--ink2)",
                      }}
                      className="flex select-none items-center gap-1.5 rounded-lg border px-3 py-1.5 font-sans text-[11px] leading-4 font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ink"
                    >
                      <Icon strokeWidth={1.5} className="size-3.5 shrink-0" aria-hidden="true" />
                      {child.label}
                    </motion.button>
                  )
                })}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
