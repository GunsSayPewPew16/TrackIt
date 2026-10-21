import { useEffect, useId, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"

import { CountUp } from "@/components/CountUp"
import { Tile } from "@/features/analytics/Tile"
import { useLongPress } from "@/hooks/useLongPress"
import { gaugeModel } from "@/lib/analytics"
import { join } from "@/lib/classes"
import { startOfMonth, wholeMoney } from "@/lib/format"
import { lightTap } from "@/lib/haptics"
import type { Row } from "@/lib/types"

const N = 60 // tick count
const C = 69.5 // centre of the 139px dial
const R1 = 60
const R2 = 68
const SPRING = { type: "spring", stiffness: 300, damping: 30 } as const

/** One path holding every 1px radial tick, starting at 12 o'clock. */
const TICKS = Array.from({ length: N }, (_, i) => {
  const a = ((-90 + (i * 360) / N) * Math.PI) / 180
  const p = (r: number) => `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`
  return `M${p(R1)}L${p(R2)}`
}).join("")

export function GaugeCard({
  rows,
  now,
  budgetCents,
  budgetCategories,
  onSetBudget,
}: {
  rows: Row[]
  now: number
  /** What the dial measures against, in paise: the owner's total-spending budget. */
  budgetCents: number
  /** What that budget counts — the owner's own selection, or `null` for every expense. */
  budgetCategories: string[] | null
  /** A long press on the dial opens the budget editor (`features/budget/BudgetSheet.tsx`). */
  onSetBudget: () => void
}) {
  const maskId = useId().replace(/:/g, "")
  const model = useMemo(
    () => gaugeModel(rows, now, budgetCents, budgetCategories),
    [rows, now, budgetCents, budgetCategories],
  )
  /**
   * The month the dial is showing, or `null` for the newest one — the current month.
   *
   * Stored as the month's own midnight rather than an index: the carousel grows as months
   * are logged, and an index would quietly start pointing at a different month when one
   * arrives in front of it.
   */
  const [selectedAt, setSelectedAt] = useState<number | null>(null)
  const found = selectedAt === null ? -1 : model.months.findIndex((month) => month.at === selectedAt)
  const index = found >= 0 ? found : model.months.length - 1
  const month = model.months[index]
  const spent = month.cents
  const thisMonth = startOfMonth(now)
  const isCurrent = month.at === thisMonth
  const caption = isCurrent ? "Total this month" : `Total in ${month.name}`
  const fraction = model.target > 0 ? Math.min(1, spent / model.target) : 0
  // A dial is a thing to hold: the hold is the only control on it, and it opens the editor.
  const hold = useLongPress(onSetBudget)

  /*
   * The carousel is a normal sideways scroller, so a finger swipes it the way the ledger's
   * date row moves. When the month changes under it — a tap, or the newest month on arrival —
   * the strip brings that pill into view without moving the page around it.
   */
  const pills = useRef(new Map<number, HTMLButtonElement>())
  useEffect(() => {
    pills.current.get(month.at)?.scrollIntoView({ inline: "nearest", block: "nearest" })
  }, [month.at])

  return (
    <Tile className="flex h-56 flex-col">
      <div
        {...hold}
        role="button"
        tabIndex={0}
        aria-label={`${isCurrent ? caption : `Total in ${month.label}`}: ${wholeMoney(spent)} of ${wholeMoney(model.target)}. Hold to change the budget`}
        title="Hold to change the budget"
        className="relative size-[139px] cursor-pointer touch-manipulation select-none [-webkit-touch-callout:none]"
      >
        <svg viewBox="0 0 139 139" className="absolute inset-0 size-full" aria-hidden>
          <defs>
            {/* A thick arc sweeps clockwise to reveal the ticks the spend has reached. */}
            <mask id={maskId}>
              <motion.circle
                cx={C}
                cy={C}
                r={64}
                fill="none"
                stroke="white"
                strokeWidth={14}
                transform={`rotate(-90 ${C} ${C})`}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: fraction }}
                transition={SPRING}
              />
            </mask>
          </defs>
          {/* The unspent ticks are dimmed ink, and the spent ones are sage at 2.5px. The gap
              between the two is what tells the eye how far the spend has got, so both the colour
              and the weight separate them: at 1px the sage ticks were lost against the ring. */}
          <path d={TICKS} fill="none" strokeWidth={1.5} className="stroke-ink2 opacity-30" />
          <path d={TICKS} fill="none" strokeWidth={2.5} className="stroke-sage" mask={`url(#${maskId})`} />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {/* The dial is the **total** budget, not the food one: the dashboard's envelope card
              is where Food & Beverages is measured, and two dials saying "F&B" over two
              different denominators is the confusion this label removes. The month is the
              carousel's: this one when it is the month we are in, its name otherwise. */}
          <p className="w-[104px] text-[10px] leading-3 tracking-[0.01em] text-ink2">{caption}</p>
          <CountUp
            cents={spent}
            format={wholeMoney}
            className="block font-display text-2xl leading-7 font-bold tracking-[-0.03em]"
          />
          <p className="text-[11px] leading-3 tracking-[0.01em] text-ink2">/ {wholeMoney(model.target)}</p>
        </div>
      </div>

      {/*
        The months with something in them, as one sideways carousel rather than the old
        this/last switch: the year's history is usually more than two months, and a month
        is chosen by tapping it or swiping the strip. A month with no expense logged is not
        a stop — only the current month is always there, so the dial has somewhere to open.
        The strip takes the screen's sideways gesture for itself (`data-swipe-ignore`), even
        when there is only one month to page.
      */}
      <div
        role="group"
        aria-label="Months with spending"
        data-swipe-ignore
        className="hide-scrollbar -mx-1 flex h-12 snap-x items-center gap-1 overflow-x-auto px-1"
      >
        {model.months.map((entry) => {
          const active = entry.at === month.at
          return (
            <button
              key={entry.at}
              ref={(node) => {
                if (node) pills.current.set(entry.at, node)
                else pills.current.delete(entry.at)
              }}
              type="button"
              onClick={() => {
                lightTap()
                setSelectedAt(entry.at)
              }}
              aria-pressed={active}
              aria-label={entry.label}
              className={join(
                "h-7 flex-none snap-center rounded-full px-2 text-[10px] leading-3 tracking-[0.02em]",
                active ? "bg-sage text-on-sage" : "border border-line text-ink2",
              )}
            >
              {entry.short}
            </button>
          )
        })}
      </div>
    </Tile>
  )
}
