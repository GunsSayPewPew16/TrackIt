import { motion } from "framer-motion"
import { useEffect, useRef } from "react"

import { RowIcon } from "@/components/RowIcon"
import { lightTap } from "@/lib/haptics"
import { join } from "@/lib/classes"

/**
 * The category picker: a closed row that unfolds into BudgetBakers' own parent
 * dimensions as an asymmetric bento mosaic.
 *
 * **The tiles are washes, not swatches.** A card is its data colour at
 * `--tint-bg` (14% in dark over the card's #1A221E, 10% on white) with a
 * `--tint-border` (35%) hairline; the colour names the dimension without shouting it.
 * The chosen tile is the exception — it takes a solid border in its own colour and
 * scales to 0.97, while every other tile fades to 0.4. That is the whole focus model:
 * one card lit, the rest receding, so a thumb can see what it picked without reading.
 *
 * **The mosaic is the parent tree, not the subcategories.** Six dimensions are what
 * Wallet's own browser draws at the top level, and they are the ones a person can
 * choose in one tap: Food & Drink and Shopping get the wide 2×1 blocks because they
 * are where the money goes; Life & Leisure gets the 2×2; Investments is a compact 1×1.
 * The ids are the real parent ids from `lib/categories.ts`, so a row saved here is a
 * row the rest of the app can already file, tint and total.
 */
type Tone = "red" | "gold" | "teal" | "indigo"

type MatrixCategory = {
  /** A parent category id from `lib/categories.ts`. */
  id: string
  /** The full name, said back in the closed row. */
  name: string
  /** What the tile writes, which has to fit its block. */
  short: string
  /** Which data colour wash it wears. */
  tone: Tone
  /** Its place in the 3×4 mosaic. */
  area: string
}

const MATRIX: MatrixCategory[] = [
  { id: "food-drinks", name: "Food & Drink", short: "Food & drink", tone: "red", area: "col-span-2" },
  { id: "housing", name: "Housing & Utilities", short: "Housing", tone: "indigo", area: "" },
  { id: "shopping", name: "Shopping", short: "Shopping", tone: "red", area: "col-span-2" },
  { id: "investments", name: "Investments & Savings", short: "Investments", tone: "gold", area: "" },
  {
    id: "life-entertainment",
    name: "Life & Leisure",
    short: "Life & leisure",
    tone: "teal",
    area: "col-span-2 row-span-2",
  },
  { id: "transportation", name: "Transportation", short: "Transport", tone: "indigo", area: "row-span-2" },
]

const SPRING = { type: "spring", stiffness: 320, damping: 30 } as const
/** How long the mosaic stays up after a pick before it folds back to one row. */
const COLLAPSE_DELAY = 280

const wash = (tone: Tone) => `color-mix(in srgb, var(--data-${tone}) var(--tint-bg), transparent)`
const edge = (tone: Tone) => `color-mix(in srgb, var(--data-${tone}) var(--tint-border), transparent)`

interface CategoryMatrixProps {
  value: string | null
  expanded: boolean
  onExpand: () => void
  onCollapse: () => void
  onSelect: (id: string) => void
}

export function CategoryMatrix({ value, expanded, onExpand, onCollapse, onSelect }: CategoryMatrixProps) {
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const selected = MATRIX.find((category) => category.id === value) ?? null

  const pick = (id: string) => {
    lightTap() // 8ms, fired inside the tap so iOS plays its switch
    onSelect(id)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(onCollapse, COLLAPSE_DELAY)
  }

  if (!expanded) {
    return (
      <motion.button
        layoutId="categoryMatrix"
        transition={SPRING}
        type="button"
        aria-expanded={false}
        aria-label={selected ? `Category: ${selected.name}. Change category` : "Choose a category"}
        onClick={() => {
          lightTap()
          onExpand()
        }}
        className="flex h-14 w-full shrink-0 items-center justify-between rounded-[20px] border border-line bg-card px-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ink"
      >
        <span className="font-sans text-[13px] leading-4 text-ink">Category</span>
        {selected ? (
          <span className="flex items-center gap-2 text-[13px] leading-4 font-medium text-ink">
            <RowIcon name={selected.id} className="size-5" />
            {selected.name}
          </span>
        ) : (
          <span className="font-editorial text-[15px] leading-5 italic text-ink2/60">Select category...</span>
        )}
      </motion.button>
    )
  }

  return (
    <motion.div
      layoutId="categoryMatrix"
      transition={SPRING}
      className="flex min-h-0 flex-1 flex-col gap-2 rounded-[20px] border border-line bg-card p-4"
    >
      <div className="flex h-5 items-baseline justify-between">
        <span className="font-sans text-[13px] leading-4 text-ink">Category</span>
        <span className="font-editorial text-[13px] leading-4 italic text-ink2">Choose one</span>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.08, duration: 0.18 }}
        role="group"
        aria-label="Categories"
        className="grid min-h-0 flex-1 grid-cols-3 grid-rows-4 gap-2"
      >
        {MATRIX.map((category) => {
          const isSelected = value === category.id
          const dimmed = value !== null && !isSelected
          return (
            <motion.button
              key={category.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => pick(category.id)}
              animate={{ scale: isSelected ? 0.97 : 1, opacity: dimmed ? 0.4 : 1 }}
              transition={SPRING}
              style={{
                backgroundColor: wash(category.tone),
                borderColor: isSelected ? `var(--data-${category.tone})` : edge(category.tone),
              }}
              className={join(
                "flex min-h-0 flex-col items-start justify-between overflow-hidden rounded-2xl border p-3 text-left text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink",
                category.area,
              )}
            >
              <RowIcon name={category.id} className="size-5" />
              <span className="max-w-full truncate font-sans text-[12px] leading-4 font-medium tracking-wide-tag">
                {category.short}
              </span>
            </motion.button>
          )
        })}
      </motion.div>
    </motion.div>
  )
}
