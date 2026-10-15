import { useMemo, useState } from "react"
import { Bus, Cpu, Plus, ShoppingBag, UtensilsCrossed, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BottomRail, type RailTab } from "@/components/rail/BottomRail"
import { UpiPaySheet, type PaySubmit } from "@/components/upi/UpiPaySheet"
import { UpiScanSheet } from "@/components/upi/UpiScanSheet"
import { type UpiPayee } from "@/lib/upi"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ *
 * Domain
 * Money is stored as integer paise (no floats), and the owner's money is in
 * rupees (INR), grouped en-IN. Amounts below are paise: 42000 = ₹420.
 * ------------------------------------------------------------------ */

type Period = "today" | "week" | "month"
type Category = "food" | "transit" | "saas" | "shopping"
type Screen = "home" | "ledger"

type Expense = {
  id: string
  title: string
  category: Category
  amount: number
  /** 0 = today. Drives the Today / Week / Month filter. */
  daysAgo: number
  time: string
  tags: string[]
  overBudget?: boolean
}

const PERIOD_DAYS: Record<Period, number> = { today: 1, week: 7, month: 30 }

const CATEGORIES: Record<
  Category,
  { label: string; icon: LucideIcon; cell: string; chip: string }
> = {
  food: {
    label: "Food & Dining",
    icon: UtensilsCrossed,
    cell: "bg-paper",
    chip: "bg-ink text-cream",
  },
  transit: {
    label: "Transit",
    icon: Bus,
    cell: "bg-khaki",
    chip: "bg-tangerine text-ink",
  },
  saas: {
    label: "SaaS Subscriptions",
    icon: Cpu,
    cell: "bg-ink text-cream",
    chip: "bg-cream text-ink",
  },
  shopping: {
    label: "Shopping",
    icon: ShoppingBag,
    cell: "bg-paper",
    chip: "bg-oat text-ink",
  },
}

const EXPENSES: Expense[] = [
  { id: "e01", title: "Blue Tokai Coffee", category: "food", amount: 42000, daysAgo: 0, time: "09:12", tags: ["Personal"] },
  { id: "e02", title: "Swiggy Dinner", category: "food", amount: 124000, daysAgo: 0, time: "20:40", tags: ["Personal"], overBudget: true },
  { id: "e03", title: "Chai & Samosa", category: "food", amount: 8000, daysAgo: 0, time: "17:05", tags: ["Personal"] },
  { id: "e04", title: "Metro Card Recharge", category: "transit", amount: 50000, daysAgo: 1, time: "08:05", tags: ["Personal"] },
  { id: "e05", title: "Uber to Airport", category: "transit", amount: 118000, daysAgo: 2, time: "06:30", tags: ["Work Reimbursement"] },
  { id: "e06", title: "Figma Professional", category: "saas", amount: 150000, daysAgo: 3, time: "00:10", tags: ["Work Reimbursement"] },
  { id: "e07", title: "BigBasket Groceries", category: "food", amount: 286500, daysAgo: 4, time: "18:20", tags: ["Personal"], overBudget: true },
  { id: "e08", title: "Notion Plus", category: "saas", amount: 80000, daysAgo: 5, time: "00:02", tags: ["Personal"] },
  { id: "e09", title: "Rapido Ride", category: "transit", amount: 9500, daysAgo: 6, time: "22:15", tags: ["Personal"] },
  { id: "e10", title: "Zara", category: "shopping", amount: 349900, daysAgo: 9, time: "13:45", tags: ["Personal"], overBudget: true },
  { id: "e11", title: "AWS Hosting", category: "saas", amount: 214000, daysAgo: 12, time: "00:30", tags: ["Work Reimbursement"] },
  { id: "e12", title: "Myntra Sale", category: "shopping", amount: 129900, daysAgo: 16, time: "21:50", tags: ["Personal"] },
]

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
})

function formatMoney(paise: number) {
  return rupees.format(paise / 100)
}

const isCategory = (id: string): id is Category => id in CATEGORIES

const CATEGORY_OPTIONS = (Object.keys(CATEGORIES) as Category[]).map((id) => ({
  id,
  label: CATEGORIES[id].label,
}))

/**
 * A first guess at the category from the merchant's name. Only a starting point:
 * the select is right there and the owner's answer always wins.
 */
const CATEGORY_HINTS: [RegExp, Category][] = [
  [/swiggy|zomato|dominos|pizza|burger|kfc|mcdonald|restaurant|cafe|coffee|kitchen|dhaba|biryani|bakery|chai|food|blinkit|zepto|instamart|bigbasket|jiomart|dmart|mart|grocer|kirana|dairy|milk|vegetab|fruit/i, "food"],
  [/uber|ola|rapido|cab|taxi|metro|irctc|rail|bus\b|transit|transport|redbus|fuel|petrol|diesel|indianoil|bharat petro|shell/i, "transit"],
  [/figma|notion|aws|hosting|cloud|github|openai|adobe|subscription|saas|netflix|spotify|google/i, "saas"],
  [/zara|myntra|amazon|flipkart|ajio|shop|store|mall|retail/i, "shopping"],
]

function guessCategory(payee: UpiPayee): Category {
  const haystack = `${payee.pn} ${payee.pa}`
  for (const [pattern, category] of CATEGORY_HINTS) {
    if (pattern.test(haystack)) return category
  }
  return "shopping"
}

function dayLabel(daysAgo: number) {
  if (daysAgo === 0) return "Today"
  if (daysAgo === 1) return "Yesterday"
  return `${daysAgo}d ago`
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default function ExpenseTracker() {
  const [screen, setScreen] = useState<Screen>("home")
  const [period, setPeriod] = useState<Period>("month")
  const [expenses, setExpenses] = useState<Expense[]>(EXPENSES)
  // The scan-and-pay flow: scan a code, then confirm the payee and amount.
  const [flow, setFlow] = useState<{ step: "scan" } | { step: "pay"; payee: UpiPayee } | null>(null)

  // Log first; the payment link is shown only after this row exists.
  function logExpense(draft: PaySubmit) {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    const row: Expense = {
      id: `u${Date.now()}`,
      title: draft.note || "Expense",
      category: isCategory(draft.category) ? draft.category : "shopping",
      amount: draft.amountCents,
      daysAgo: 0,
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      tags: ["Personal"],
    }
    setExpenses((prev) => [row, ...prev])
  }

  const visible = useMemo(
    () =>
      expenses.filter((e) => e.daysAgo < PERIOD_DAYS[period]).sort(
        (a, b) => a.daysAgo - b.daysAgo || b.time.localeCompare(a.time),
      ),
    [period, expenses],
  )

  const categoryTotals = (Object.keys(CATEGORIES) as Category[]).map((key) => {
    const rows = visible.filter((e) => e.category === key)
    return {
      key,
      amount: rows.reduce((s, e) => s + e.amount, 0),
      count: rows.length,
      over: rows.some((e) => e.overBudget),
    }
  })

  // The month's spend for the summary box, and the last seven days for its bar strip.
  const monthRows = expenses.filter((e) => e.daysAgo < PERIOD_DAYS.month)
  const monthTotal = monthRows.reduce((s, e) => s + e.amount, 0)
  const monthOver = monthRows.filter((e) => e.overBudget).length
  const dayTotals = Array.from({ length: 7 }, (_, i) => {
    const daysAgo = 6 - i
    return {
      daysAgo,
      amount: expenses.filter((e) => e.daysAgo === daysAgo).reduce((s, e) => s + e.amount, 0),
    }
  })
  const peak = Math.max(...dayTotals.map((d) => d.amount), 1)
  const weekBars = dayTotals.map((d) => ({
    day: d.daysAgo,
    today: d.daysAgo === 0,
    height: Math.max(8, Math.round((d.amount / peak) * 100)),
  }))

  const openScanner = () => setFlow({ step: "scan" })

  function selectTab(tab: RailTab) {
    if (tab === "pay") {
      openScanner()
      return
    }
    setScreen(tab)
  }

  const periodTabs = (
    <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
      <TabsList>
        <TabsTrigger value="today">Today</TabsTrigger>
        <TabsTrigger value="week">Week</TabsTrigger>
        <TabsTrigger value="month">Month</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  return (
    <div className="min-h-svh bg-canvas text-ink">
      <header className="border-b border-ink/10 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-xl font-bold tracking-tight">TrackIt</span>
            <span className="hidden font-mono text-[11px] tracking-wide uppercase opacity-60 sm:inline">
              Wallet · INR
            </span>
          </div>
          <Button variant="accent" size="sm" onClick={openScanner}>
            <Plus />
            Quick log
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pt-6 pb-36 md:px-8 md:pt-10">
        {screen === "home" && (
          <section aria-labelledby="home-title" className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 id="home-title" className="font-display text-4xl font-bold tracking-tight md:text-5xl">
                Expenses
              </h1>
              <p className="text-sm text-ink/60">Where your money went, by category.</p>
            </div>

            {/* Placeholder for the total account balance, until accounts are linked. */}
            <Card className="gap-4 rounded-[32px] border-ink bg-ink p-6 text-cream">
              <CardTitle className="opacity-70">Total account balance</CardTitle>
              <div className="font-display text-[56px] leading-none font-bold tracking-tight tabular-nums">
                ₹ —
              </div>
              <p className="text-sm text-cream/70">
                Placeholder. Your linked accounts will show their total here.
              </p>
            </Card>

            {periodTabs}

            {/* Category bento: flat cells on an oat well, like the reference's calendar panel. */}
            <div className="grid grid-cols-2 gap-2.5 rounded-[32px] bg-oat p-2.5 md:grid-cols-4">
              {categoryTotals.map((c) => {
                const meta = CATEGORIES[c.key]
                const Icon = meta.icon
                return (
                  <Card key={c.key} className={cn("gap-3 p-4", meta.cell)}>
                    <div className="flex items-center justify-between">
                      <span
                        className={cn("flex size-9 items-center justify-center rounded-[12px]", meta.chip)}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      {c.over && <Badge variant="accent">Over</Badge>}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-[10px] tracking-wide uppercase opacity-70">
                        {meta.label}
                      </span>
                      <span className="font-display text-xl font-bold tracking-tight tabular-nums">
                        {formatMoney(c.amount)}
                      </span>
                      <span className="font-mono text-[10px] tracking-wide uppercase opacity-70">
                        {c.count} {c.count === 1 ? "item" : "items"}
                      </span>
                    </div>
                  </Card>
                )
              })}
            </div>
          </section>
        )}

        {screen === "ledger" && (
          <section aria-labelledby="ledger-title" className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 id="ledger-title" className="font-display text-4xl font-bold tracking-tight md:text-5xl">
                Ledger
              </h1>
              <p className="text-sm text-ink/60">Every transaction, newest first.</p>
            </div>

            {/* Spend summary: the month's total, a count, and a seven-day bar strip. */}
            <Card className="relative gap-0 rounded-[32px] border-ink bg-ink p-6 text-cream">
              <button
                type="button"
                onClick={openScanner}
                aria-label="Quick log"
                className="absolute top-5 right-5 flex size-14 cursor-pointer items-center justify-center rounded-full bg-tangerine text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
              >
                <Plus className="size-6" aria-hidden="true" />
              </button>
              <CardTitle className="opacity-70">Spent this month</CardTitle>
              <div className="mt-5 font-display text-[56px] leading-none font-bold tracking-tight tabular-nums">
                {formatMoney(monthTotal)}
              </div>
              <p className="mt-3 font-mono text-xs tracking-wide uppercase text-cream/70">
                {monthRows.length} transactions ·{" "}
                <span className="text-tangerine">{monthOver} over budget</span>
              </p>
              <div className="mt-8 flex h-20 items-end gap-2" aria-hidden="true">
                {weekBars.map((bar) => (
                  <span
                    key={bar.day}
                    className={cn("flex-1 rounded-[6px]", bar.today ? "bg-tangerine" : "bg-cream/20")}
                    style={{ height: `${bar.height}%` }}
                  />
                ))}
              </div>
              <CardTitle className="mt-3 opacity-60">Weekly velocity · last 7 days</CardTitle>
            </Card>

            {periodTabs}

            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-wide uppercase">Transactions</span>
              <Badge variant="outline">{visible.length}</Badge>
            </div>

            {visible.length === 0 && (
              <p className="py-6 text-center text-sm text-ink/60">Nothing logged in this period.</p>
            )}

            <div className="flex flex-col gap-2.5 md:grid md:grid-cols-2">
              {visible.map((e) => {
                const meta = CATEGORIES[e.category]
                const Icon = meta.icon
                return (
                  <Card key={e.id} className="relative flex-row items-center gap-3 overflow-hidden p-3.5 pl-5">
                    {e.overBudget && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 w-2 rounded-l-full bg-tangerine"
                      />
                    )}
                    <span
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-[12px]",
                        meta.chip,
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>

                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-sm font-semibold">{e.title}</span>
                      <span className="font-mono text-[10px] tracking-wide uppercase opacity-60">
                        {e.time} · {dayLabel(e.daysAgo)}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {e.tags.map((tag) => (
                          <Badge key={tag} variant="outline">
                            {tag}
                          </Badge>
                        ))}
                        {e.overBudget && <Badge variant="accent">Over budget</Badge>}
                      </div>
                    </div>

                    <span className="shrink-0 text-sm font-bold tabular-nums">{formatMoney(e.amount)}</span>
                  </Card>
                )
              })}
            </div>
          </section>
        )}
      </main>

      <BottomRail active={screen} onSelect={selectTab} />

      {flow?.step === "scan" && (
        <UpiScanSheet
          onPayee={(payee) => setFlow({ step: "pay", payee })}
          onClose={() => setFlow(null)}
        />
      )}

      {flow?.step === "pay" && (
        <UpiPaySheet
          key={`${flow.payee.pa}-${flow.payee.amountCents ?? "open"}`}
          payee={flow.payee}
          initialCategory={guessCategory(flow.payee)}
          categories={CATEGORY_OPTIONS}
          onPay={logExpense}
          onClose={() => setFlow(null)}
        />
      )}
    </div>
  )
}
