import { useMemo, useState } from "react"
import { Bus, Cpu, Plus, ShoppingBag, UtensilsCrossed, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BottomRail, type RailTab } from "@/components/rail/BottomRail"
import { SettingsScreen } from "@/components/settings/SettingsScreen"
import { UpiPaySheet, type PaySubmit } from "@/components/upi/UpiPaySheet"
import { UpiScanSheet } from "@/components/upi/UpiScanSheet"
import { appendLedgerRows, clearLedgerRows, readLedgerRows, type LedgerRow } from "@/lib/ledger"
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
  /**
   * When it happened, epoch ms — the one time field.
   *
   * Day, clock time and the Today / Week / Month filter are all derived from it, so
   * a row can never claim to be today's after a reload, and an imported row keeps
   * the day it actually happened on.
   */
  at: number
  tags: string[]
  overBudget?: boolean
}

const PERIOD_DAYS: Record<Period, number> = { today: 1, week: 7, month: 30 }

const DAY_MS = 24 * 60 * 60 * 1000

/** The time of day something was logged, on the owner's own clock. */
function clock(at: number) {
  const when = new Date(at)
  return `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`
}

function dayLabel(daysAgo: number) {
  if (daysAgo === 0) return "Today"
  if (daysAgo === 1) return "Yesterday"
  return `${daysAgo}d ago`
}

/**
 * Whole days between a moment and today, counted on the owner's own calendar.
 *
 * Both ends are pulled back to midnight before subtracting and the result is
 * rounded: a day is 23 or 25 hours long twice a year, and a raw division by 86,400,000
 * is how a row ends up labelled a day out.
 */
function daysAgoOf(at: number): number {
  const then = new Date(at)
  then.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((today.getTime() - then.getTime()) / DAY_MS))
}

/*
 * Each category wears a card and a small marker tile. `cell` is the card it is
 * listed on, `chip` the tile the glyph stands on. A tile is read both on that
 * card and inside a ledger row, so it is always a tone under the card: `ink`,
 * which is the dark tone in either theme, or the accent.
 */
const CATEGORIES: Record<
  Category,
  { label: string; icon: LucideIcon; cell: string; chip: string }
> = {
  food: {
    label: "Food & Dining",
    icon: UtensilsCrossed,
    cell: "bg-card",
    chip: "bg-ink text-cream",
  },
  transit: {
    label: "Transit",
    icon: Bus,
    cell: "bg-stone",
    chip: "bg-tangerine text-ink",
  },
  saas: {
    label: "SaaS Subscriptions",
    icon: Cpu,
    cell: "bg-box text-on-box",
    chip: "bg-ink text-cream",
  },
  shopping: {
    label: "Shopping",
    icon: ShoppingBag,
    cell: "bg-card",
    chip: "bg-well text-on-canvas",
  },
}

/**
 * The demo's own rows, written the way a person reads them.
 *
 * `daysAgo` and `time` are how the design was drawn — "today at 09:12" — and
 * `seedRow` turns each one into the single absolute moment the ledger stores. The
 * two shapes exist only here: everything downstream (the filters, the exports, the
 * writers) speaks in `at`.
 */
type SeedRow = {
  id: string
  title: string
  category: Category
  amount: number
  daysAgo: number
  time: string
  tags: string[]
  overBudget?: boolean
}

const SEED: SeedRow[] = [
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

/** One seed row as the ledger draws it: local wall-clock arithmetic, so a row keeps
 *  its own time of day even if a daylight-saving change falls inside its week. */
function seedRow(row: SeedRow): Expense {
  const [hours, minutes] = row.time.split(":").map(Number)
  const today = new Date()
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    amount: row.amount,
    at: new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - row.daysAgo,
      hours,
      minutes,
    ).getTime(),
    tags: row.tags,
    overBudget: row.overBudget,
  }
}

const EXPENSES: Expense[] = SEED.map(seedRow)

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

/**
 * A remembered row — a handoff, or something imported — in the shape the ledger draws.
 *
 * Its day comes from when it happened rather than from when the page was opened, and
 * a handoff's target rides along as a tag, which is how a row says who it was paid to.
 */
function fromLedgerRow(row: LedgerRow): Expense {
  return {
    id: row.id,
    title: row.title,
    category: isCategory(row.category) ? row.category : "shopping",
    amount: row.amountCents,
    at: row.at,
    tags: [...(row.tags ?? []), ...(row.handedTo ? [row.handedTo] : [])],
  }
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default function ExpenseTracker() {
  const [screen, setScreen] = useState<Screen>("home")
  const [period, setPeriod] = useState<Period>("month")
  /** Settings opens over this screen; what it holds lives in its own file. */
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Everything this browser added — handoffs, and anything imported — ahead of the
  // demo's own rows. See lib/ledger.ts for why any of it is remembered at all.
  const [expenses, setExpenses] = useState<Expense[]>(
    () => [...readLedgerRows().map(fromLedgerRow), ...EXPENSES],
  )
  // The scan-and-pay flow: scan a code, then confirm the payee and amount.
  const [flow, setFlow] = useState<{ step: "scan" } | { step: "pay"; payee: UpiPayee } | null>(null)

  /**
   * Log the expense the owner just confirmed, and remember it.
   *
   * This runs before the payment leaves for Google Pay, so the row exists even if
   * the handoff does nothing — and it is written to storage in the same breath,
   * because the handoff is one-way. Nothing will ever tell this page whether the
   * money moved, so this row is the only record of it, and a record that vanished
   * on the next reload would not be one.
   *
   * The sheet's note starts empty — it is the owner's words, and a note is sent to
   * the merchant inside the link — so the payee's own name is what a row falls back
   * to: `₹2,865 · BigBasket` beats a row called "Expense" with no idea who took the
   * money. That name is the ledger's, and it never travels to the merchant.
   */
  function logExpense(draft: PaySubmit, payeeName: string, handedTo: string) {
    const at = Date.now()
    const row: Expense = {
      id: `u${at}`,
      title: draft.note || payeeName,
      category: isCategory(draft.category) ? draft.category : "shopping",
      amount: draft.amountCents,
      at,
      // The handoff is the row's mark: who the payment went to, by name.
      tags: [handedTo],
    }
    appendLedgerRows([
      {
        id: row.id,
        title: row.title,
        category: row.category,
        amountCents: draft.amountCents,
        at,
        handedTo,
      },
    ])
    setExpenses((prev) => [row, ...prev])
  }

  /**
   * The whole ledger in the stored-row shape — what the two writers and the importer
   * all speak. The demo's own rows carry no handoff and no extra tags, so they travel
   * as themselves.
   */
  const exportRows: LedgerRow[] = useMemo(
    () =>
      expenses.map((expense) => ({
        id: expense.id,
        title: expense.title,
        category: expense.category,
        amountCents: expense.amount,
        at: expense.at,
        tags: expense.tags.length > 0 ? expense.tags : undefined,
      })),
    [expenses],
  )

  /**
   * Add what an import produced: storage first, then the screen.
   *
   * Rows are matched by id on both sides, so a file imported twice adds nothing the
   * second time — the mistake worth designing for. The counts handed back come from
   * storage, which is the side that knows what it actually kept.
   */
  function importRows(rows: LedgerRow[]): { added: number; skipped: number } {
    const result = appendLedgerRows(rows)
    const known = new Set(expenses.map((expense) => expense.id))
    const fresh: LedgerRow[] = []
    for (const row of rows) {
      if (known.has(row.id)) continue
      known.add(row.id)
      fresh.push(row)
    }
    if (fresh.length > 0) setExpenses((prev) => [...fresh.map(fromLedgerRow), ...prev])
    return result
  }

  /** Forget everything this browser added, leaving the demo's own rows standing. */
  function clearRows(): number {
    const forgotten = clearLedgerRows()
    setExpenses([...EXPENSES])
    return forgotten
  }

  // Newest first, which is what the ledger's own subtitle promises: one timestamp per
  // row is what lets a single comparison do the whole sort.
  const visible = useMemo(
    () => expenses.filter((e) => daysAgoOf(e.at) < PERIOD_DAYS[period]).sort((a, b) => b.at - a.at),
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
  const monthRows = expenses.filter((e) => daysAgoOf(e.at) < PERIOD_DAYS.month)
  const monthTotal = monthRows.reduce((s, e) => s + e.amount, 0)
  const monthOver = monthRows.filter((e) => e.overBudget).length
  const dayTotals = Array.from({ length: 7 }, (_, i) => {
    const daysAgo = 6 - i
    return {
      daysAgo,
      amount: expenses.filter((e) => daysAgoOf(e.at) === daysAgo).reduce((s, e) => s + e.amount, 0),
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
    <div className="min-h-svh bg-canvas text-on-canvas">
      <header className="border-b border-on-canvas/10 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-xl font-bold tracking-tight">TrackIt</span>
            <span className="hidden text-[11px] font-medium tracking-wide uppercase opacity-70 sm:inline">
              Wallet · INR
            </span>
          </div>
          {/* Settings, not Quick log: logging is what the two `+` buttons on the
              summaries are for, and this corner is where a screen's own controls
              belong. It is a pill like the button it replaced, only quieter — the
              accent is for the money, and a settings destination is not money. */}
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            Settings
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
              <p className="text-sm text-on-canvas/70">Where your money went, by category.</p>
            </div>

            {/* Placeholder for the total account balance, until accounts are linked. */}
            <Card className="relative gap-4 rounded-[32px] border-box bg-box p-6 text-on-box">
              {/* The same corner and the same button as the ledger's spend box: the
                  scanner is reached from the summary the owner is looking at, and
                  from here that is the balance. */}
              <button
                type="button"
                onClick={openScanner}
                aria-label="Scan and pay"
                className="absolute top-5 right-5 flex size-14 cursor-pointer items-center justify-center rounded-full bg-tangerine text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-box"
              >
                <Plus className="size-6" aria-hidden="true" />
              </button>
              <CardTitle className="opacity-70">Total account balance</CardTitle>
              <div className="font-display text-[56px] leading-none font-bold tracking-tight tabular-nums">
                ₹ —
              </div>
              <p className="text-sm text-on-box/70">
                Placeholder. Your linked accounts will show their total here.
              </p>
            </Card>

            {periodTabs}

            {/* Category bento: light cells on a tray recessed into the canvas. */}
            <div className="grid grid-cols-2 gap-2.5 rounded-[32px] bg-well p-2.5 md:grid-cols-4">
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
                      <span className="text-[10px] font-medium tracking-wide uppercase opacity-80">
                        {meta.label}
                      </span>
                      <span className="font-display text-xl font-bold tracking-tight tabular-nums">
                        {formatMoney(c.amount)}
                      </span>
                      <span className="text-[10px] font-medium tracking-wide uppercase opacity-80">
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
              <p className="text-sm text-on-canvas/70">Every transaction, newest first.</p>
            </div>

            {/* Spend summary: the month's total, a count, and a seven-day bar strip. */}
            <Card className="relative gap-0 rounded-[32px] border-box bg-box p-6 text-on-box">
              <button
                type="button"
                onClick={openScanner}
                aria-label="Scan and pay"
                className="absolute top-5 right-5 flex size-14 cursor-pointer items-center justify-center rounded-full bg-tangerine text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-box"
              >
                <Plus className="size-6" aria-hidden="true" />
              </button>
              <CardTitle className="opacity-70">Spent this month</CardTitle>
              <div className="mt-5 font-display text-[56px] leading-none font-bold tracking-tight tabular-nums">
                {formatMoney(monthTotal)}
              </div>
              <p className="mt-3 text-xs font-medium tracking-wide uppercase text-on-box/70">
                {monthRows.length} transactions ·{" "}
                <span className="text-ember">{monthOver} over budget</span>
              </p>
              <div className="mt-8 flex h-20 items-end gap-2" aria-hidden="true">
                {weekBars.map((bar) => (
                  <span
                    key={bar.day}
                    className={cn("flex-1 rounded-[6px]", bar.today ? "bg-tangerine" : "bg-on-box/20")}
                    style={{ height: `${bar.height}%` }}
                  />
                ))}
              </div>
              <CardTitle className="mt-3 opacity-70">Weekly velocity · last 7 days</CardTitle>
            </Card>

            {periodTabs}

            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium tracking-wide uppercase">Transactions</span>
              <Badge variant="canvas">{visible.length}</Badge>
            </div>

            {visible.length === 0 && (
              <p className="py-6 text-center text-sm text-on-canvas/70">Nothing logged in this period.</p>
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
                      <span className="truncate text-sm font-medium">{e.title}</span>
                      <span className="text-[10px] font-medium tracking-wide uppercase opacity-80">
                        {clock(e.at)} · {dayLabel(daysAgoOf(e.at))}
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

      {/* Settings is a screen in its own right, opened over this one: how the ledger
          looks, what it holds, and the one action that empties it. */}
      {settingsOpen && (
        <SettingsScreen
          rows={exportRows}
          onImport={importRows}
          onClear={clearRows}
          onClose={() => setSettingsOpen(false)}
        />
      )}

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
          onPay={(draft, handedTo) => logExpense(draft, flow.payee.pn, handedTo)}
          onClose={() => setFlow(null)}
        />
      )}
    </div>
  )
}
