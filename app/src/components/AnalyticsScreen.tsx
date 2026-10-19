import { motion, type Variants } from "framer-motion"
import { useState } from "react"

import { ThemeToggle } from "@/components/ThemeToggle"
import { AllocationCard } from "@/features/analytics/AllocationCard"
import { GaugeCard } from "@/features/analytics/GaugeCard"
import { HeatmapCard } from "@/features/analytics/HeatmapCard"
import { TrendCard } from "@/features/analytics/TrendCard"
import type { Theme } from "@/lib/theme"
import type { Row } from "@/lib/types"

/**
 * Screen 3: the Stats tab. Four bento cards over the owner's own ledger — the daily
 * spend heatmap, the spend velocity line, the spend gauge and the monthly allocation.
 *
 * Every number is derived from the rows (`lib/analytics.ts`), so on a first visit with
 * nothing imported the cards draw empty, and they fill as the history does. The screen
 * is fetched like the others (`App.tsx`), so its four cards are not in the entry chunk.
 */

/** What this screen is given. Named and exported because the screen is fetched, not imported. */
export type Props = {
  rows: Row[]
  theme: Theme
  onToggleTheme: () => void
  /** The owner's total-spending budget, in paise — see `lib/budget.ts`. */
  budgetCents: number
  /** What that budget counts, or `null` for every expense — see `lib/budget.ts`. */
  budgetCategories: string[] | null
  /**
   * What both accounts held before the first row, in paise — the same openings the
   * dashboard's cards read (`lib/balances.ts`), so the trend opens where the cards do.
   * Nothing on a fresh account, rather than the import's total.
   */
  openingCents: number
  /** A long press on the dial opens the budget editor (`features/budget/BudgetSheet.tsx`). */
  onSetBudget: () => void
}

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}
const rise: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
}

export function AnalyticsScreen({
  rows,
  theme,
  onToggleTheme,
  budgetCents,
  budgetCategories,
  openingCents,
  onSetBudget,
}: Props) {
  // Read once per visit: the figures are the day the screen was opened on.
  const [now] = useState(() => Date.now())
  return (
    <motion.main
      variants={stagger}
      initial="hidden"
      animate="show"
      className="mx-auto flex w-full max-w-[390px] flex-col gap-4 px-4 pt-6 pb-nav"
    >
      <motion.header variants={rise} className="flex items-start justify-between">
        <h1 className="font-serif text-[28px] leading-8 tracking-[-0.01em]">
          <span className="block font-normal text-ink2 italic">Financial Analytics</span>
          <span className="block font-medium">Insights</span>
        </h1>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </motion.header>

      <motion.div variants={rise}>
        <TrendCard rows={rows} now={now} openingCents={openingCents} />
      </motion.div>

      <motion.div variants={rise} className="grid grid-cols-2 gap-4">
        <GaugeCard
          rows={rows}
          now={now}
          budgetCents={budgetCents}
          budgetCategories={budgetCategories}
          onSetBudget={onSetBudget}
        />
        <HeatmapCard rows={rows} now={now} />
      </motion.div>

      <motion.div variants={rise}>
        <AllocationCard rows={rows} now={now} />
      </motion.div>
    </motion.main>
  )
}
