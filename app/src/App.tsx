import { AnimatePresence, motion } from "framer-motion"
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react"

import { BottomNav } from "@/components/BottomNav"
import { DashboardScreen } from "@/components/DashboardScreen"
import { LoginScreen } from "@/components/LoginScreen"
import { useAuth } from "@/hooks/useAuth"
// Types only, and that is what keeps the two screens below out of the entry chunk: an
// `import type` is erased, so nothing here fetches them until a tap does.
import type { Props as LedgerProps } from "@/components/LedgerScreen"
import type { Props as ScanProps } from "@/components/ScanScreen"
import type { Props as StatsProps } from "@/components/AnalyticsScreen"
// The settings screen's types only, same reason: it is fetched when its tab is first tapped.
import type { Props as SettingsProps } from "@/components/SettingsScreen"
// The budget editor's types only, for the same reason: it is fetched on the first hold.
import type { BudgetSheetProps } from "@/features/budget/BudgetSheet"
// The balance panel's types only, for the same reason: it is fetched on the first hold.
import type { BalanceSheetProps } from "@/features/balance/BalanceSheet"
// The sheet's types only. The component itself is fetched the first time the pill is
// pressed, so the entry chunk does not pay for a keypad most opens never open.
import type { ManualEntry, SheetProps } from "@/features/manual-entry"
import { logPaidPayee } from "@/features/upi/logScan"
import type { UpiPayee } from "@/features/upi/upi"
import { useBalances } from "@/hooks/useBalances"
import { useBudgets } from "@/hooks/useBudgets"
import { useGreeting } from "@/hooks/useGreeting"
import { useLedger } from "@/hooks/useLedger"
import { useTheme } from "@/hooks/useTheme"
import { demoDashboard, DEMO_LEDGER } from "@/lib/demo"
import { DEFAULT_CATEGORY } from "@/lib/categories"
import { filedName } from "@/lib/refile"
import { dashboardModel, hasHistory, ledgerModel } from "@/lib/derive"
import { budgetSpent, type BudgetScope } from "@/lib/budget"
import { startOfMonth, startOfNextMonth } from "@/lib/format"
import { appendToLedger } from "@/lib/ledger"
import type { Row } from "@/lib/types"

/**
 * The app: three screens, and the state that decides what they show.
 *
 * **The greeting is the one thing here that is neither.** It is a different language
 * every time the app is opened — the owner's ask — so it is chosen once per load by
 * `useGreeting`, out of the fifty words in the bundle (`lib/greetings.ts`) and, where the
 * build has a server, out of the `greetings` table the Worker draws one row from
 * (`backend/`). That is why it is a prop rather than a field of the dashboard model:
 * the models are the owner's money, derived from their rows, and this is a line of
 * decoration that has to be on screen before anything is derived at all.
 *
 * **Which content.** The owner's imported history decides it, in one place. With
 * rows in the ledger both screens are computed from them (`lib/derive.ts`); with
 * nothing imported they are the artboards' own dataset (`lib/demo.ts`), so the
 * design is what a first visit shows and the owner's money is what every visit
 * after that shows. Nothing else in the app knows which of the two it got.
 *
 * **The fade between the screens.** `mode="popLayout"` is what makes it a
 * cross-fade rather than a hand-over: the screen being left is taken out of the
 * layout and fades out in place while the new one fades in over it. The duration is
 * the design's own 0.35s for a screen, which is a slower movement than the 120ms
 * repaint a theme change uses: one is the page arriving, the other a switch.
 *
 * **Where the ledger opens.** The wheel holds one month — the 1st through today, or a
 * past month's last day — so the month menu on the ledger screen is what reaches the
 * rest of the history: this holds the day the ledger is anchored on, and `ledgerModel`
 * builds that month around it and opens the wheel on its day. With no anchor the anchor
 * is the newest row, which is what the owner came to see.
 *
 * **Where a screen starts.** At its top, every time. Every way between screens is the
 * dock, and on a short window any screen scrolls, so the
 * browser would otherwise hand the new one the old one's scroll offset — the dashboard
 * opening halfway down its cards, or the ledger past a day the owner has not seen.
 * `scrollTo` is instant rather than smooth on purpose: this is not a movement the
 * owner asked for, and the cross-fade is what carries the change of screen.
 *
 * **The scanner is a screen too.** The dashboard's scan square opens it, and it is the
 * only way in — the dock has no Create — and it wears the second artboard's design
 * (`components/ScanScreen.tsx`) rather than the dialog the previous app opened: it
 * has its own header and its own way back, and the cross-fade carries the change like
 * the other two. A read code opens the sheet as a payment — the scanner's
 * `onOpenEntry` — and what the confirm writes is `features/upi/logScan.ts`, so the
 * screen itself never touches the ledger.
 *
 * **The ledger is opened from the dock**, whose Ledger tab is also the way back to it
 * from the scanner; the dashboard's header circle that used to do this is gone.
 * Importing is not reachable from the UI at all at the moment:
 * `components/DataSheet.tsx` is written and unwired,
 * waiting for the owner to place it. The import path behind it (`useLedger`'s
 * `importHistory`) still works the moment something calls it.
 *
 * **The dock is the one thing every screen shares.** It is rendered beside the
 * `AnimatePresence` rather than inside it, so it neither fades with a screen nor
 * leaves the page when the screen does: the tabs are a level above the views and
 * stay put while the content cross-fades over them. Its `active` is the view itself
 * — the tab keys are view names, so a tab is a screen — and the scanner is the one
 * view that is not a tab, so the circle holds its place while the camera is up and
 * slides from there when the owner goes back.
 *
 * **Only the dashboard is in the file that must arrive before the first pixel.** Nothing
 * renders until this module runs, so everything it imports is a cost the owner pays before
 * seeing anything — and the other screens sit behind a tap most opens never make. They
 * are chunks of their own for that reason: the ledger's month menu is the app's only
 * Radix dependency, and the scanner is a whole decoder (barcode detection, WebRTC shims, and
 * a WASM build fetched from a CDN in turn). Out of the entry file they took it from 657 kB
 * to 415 kB, which is 216 kB over the wire down to 129.
 *
 * Three things go with splitting them, and all three are deliberate:
 *
 * - **A screen is in hand before the view changes.** `goTo` fetches the module and only then
 *   switches, because the design has no loading state and a screen that is not there yet is
 *   worse than a wait: with `Suspense` inside the `AnimatePresence` below, both screens end
 *   up mounted and neither animates, which is a tap that appears to do nothing at all.
 * - **They are fetched again, idly, once the first screen is up** (`requestIdleCallback`, or
 *   a timeout where there is none), so in practice a tap is a screen rather than a wait. The
 *   order is the point: bytes the owner has not asked for are never allowed to delay the
 *   pixels they have.
 * - **A tap that lands before the module does keeps the screen being left on screen**, which
 *   is the one case where the cross-fade does not carry the change. Nothing is drawn in its
 *   place, because a spinner or a skeleton would be this app's taste and not the artboard's.
 */

/**
 * The screens that arrive when they are asked for. The named exports are the only reason these are
 * not plain `lazy` calls — a `lazy` component suspends on first render, and a suspension is exactly
 * what the cross-fade cannot carry.
 */
const screens = {
  ledger: () => import("@/components/LedgerScreen").then((screen) => screen.LedgerScreen),
  scan: () => import("@/components/ScanScreen").then((screen) => screen.ScanScreen),
  stats: () => import("@/components/AnalyticsScreen").then((screen) => screen.AnalyticsScreen),
  settings: () => import("@/components/SettingsScreen").then((screen) => screen.SettingsScreen),
} as const

type View = "dashboard" | "ledger" | "scan" | "stats" | "settings"

/** Whichever of the lazy screens has arrived — normally all of them, from the idle fetch. */
type Arrived = {
  ledger?: ComponentType<LedgerProps>
  scan?: ComponentType<ScanProps>
  stats?: ComponentType<StatsProps>
  settings?: ComponentType<SettingsProps>
}
function TrackIt() {
  const { theme, toggleTheme, palette, chooseTheme } = useTheme()
  /**
   * The moment this open is drawn on. The dashboard's figures are "this month", so they need
   * a clock, and taking it once here rather than on every derivation is also what keeps the
   * model stable for the memo below.
   */
  const [now] = useState(() => Date.now())
  const { rows, budgets, remove, update } = useLedger()
  const { limits, tracked, save: saveBudget, saveTracked } = useBudgets()
  const { openings, setBalance } = useBalances(rows)
  const greeting = useGreeting()
  const [view, setView] = useState<View>("dashboard")
  const [arrived, setArrived] = useState<Arrived>({})
  /**
   * Where the owner has most recently asked to be. A tap is not always answered in the order
   * it was made — a screen is fetched before it is shown — and this is what stops a slow
   * first tap from landing after a fast second one.
   */
  const wanted = useRef<View>("dashboard")
  /** The day the wheel's window ends on; `undefined` means "the newest row". */
  const [anchor, setAnchor] = useState<number | undefined>(undefined)
  /**
   * The manual-entry sheet, fetched on its first use. It is a modal rather than a screen,
   * but the same rule applies: nothing in the entry chunk should pay for a keypad most
   * opens never open. The module is warmed idly with the other two, so in practice the
   * first press is a sheet rather than a wait.
   */
  const [EntrySheet, setEntrySheet] = useState<ComponentType<SheetProps> | null>(null)
  const [entryOpen, setEntryOpen] = useState(false)
  /**
   * The budget editor, fetched on the first hold for the same reason every other panel is:
   * a keypad that may never be opened should not be in the entry chunk. It is warmer with the
   * others, so the first hold is normally a panel rather than a wait.
   */
  const [BudgetEditor, setBudgetEditor] = useState<ComponentType<BudgetSheetProps> | null>(null)
  const [budgetOpen, setBudgetOpen] = useState(false)
  /** Which of the two budgets the editor is about. Read while the panel closes, too. */
  const [budgetScope, setBudgetScope] = useState<BudgetScope>("food")
  /**
   * The account whose balance is being edited, if any: the front card's hold. It is the id
   * rather than the card, because the card is a formatted view of the account and the panel
   * needs the numbers (`features/balance/BalanceSheet.tsx`).
   */
  const [balanceAccount, setBalanceAccount] = useState<string | null>(null)
  /**
   * The balance panel, fetched on the first hold for the same reason the budget editor is:
   * a keypad that may never be opened does not belong in the entry chunk. It is warmed idly
   * with the others, so in practice the first hold is a panel rather than a wait.
   */
  const [BalanceEditor, setBalanceEditor] = useState<ComponentType<BalanceSheetProps> | null>(null)
  /**
   * The category the sheet opens on, when it was opened from a quick-log chip rather than
   * from the add-record pill: `null` for a blank entry, which is what the pill means.
   */
  const [entryCategory, setEntryCategory] = useState<string | null>(null)
  /**
   * The merchant a scanned code named, when the scanner opened the sheet: that turns it into
   * the payment screen (`SheetProps.payee`), seeds the keypad when the code carried an amount,
   * and makes the confirm **Pay and Log Transaction**. The row it writes is the payee's rather
   * than a hand-typed one's — `logPaidPayee` builds it, so a scanned payment keeps its own id,
   * its own `source: "upi"` and the VPA in its note.
   */
  const [entryPayee, setEntryPayee] = useState<UpiPayee | null>(null)
  /**
   * The row being corrected, when the sheet was opened from a ledger card's **Edit** rather
   * than from the add-record pill. It is the whole row, not an id, because the app already
   * holds every row (`useLedger`) and the sheet needs its figures to start on.
   */
  const [entryEditing, setEntryEditing] = useState<Row | null>(null)
  /**
   * Where the scanner's answer goes. A scanned code hands the sheet a promise, and the sentence
   * is what that promise resolves with once the owner confirms or gives up — the scanner's own
   * status line is the one place "what did that do?" is answered.
   */
  const settleScan = useRef<((sentence: string | null) => void) | null>(null)

  /**
   * After the first screen is painted, the other two are fetched in the background, so a tap
   * the owner has not made yet is not a tap that waits. This is the one place the app
   * deliberately downloads something nobody has asked to see, and it is idly scheduled so
   * that a slow phone finishes its first paint first.
   */
  useEffect(() => {
    const warm = () => {
      void screens.ledger()
      void screens.scan()
      void screens.stats()
      void screens.settings()
      void import("@/features/manual-entry")
      void import("@/features/budget/BudgetSheet")
      void import("@/features/balance/BalanceSheet")
    }
    if (typeof window.requestIdleCallback === "function") {
      const idle = window.requestIdleCallback(warm, { timeout: 2000 })
      return () => window.cancelIdleCallback(idle)
    }
    // Safari has no idle callback; a second after load is idle enough.
    const timer = window.setTimeout(warm, 1200)
    return () => window.clearTimeout(timer)
  }, [])

  /**
   * Change screens, whichever way, and start the new one at its own top.
   *
   * A tap on one of the lazy screens waits for that screen, over the one being left rather
   * than over an empty canvas, and the idle fetch above usually means there is nothing to
   * wait for.
   */
  const goTo = useCallback(async (next: View) => {
    wanted.current = next
    if (next !== "dashboard") {
      const screen = await screens[next]()
      setArrived((was) => ({ ...was, [next]: screen }))
    }
    if (wanted.current !== next) return
    setView(next)
    window.scrollTo({ top: 0, left: 0, behavior: "instant" })
  }, [])

  /**
   * Open the sheet, fetching its module first if this is the first press.
   *
   * The amount arrives as **rupees** because that is what the keypad types; this is the
   * one boundary where it becomes the app's integer paise. Everything else about the row
   * is the ledger's own shape: an id no import can collide with, the merchant as the
   * title (or the category's name when the merchant was left empty), and `source: manual`
   * so a hand-typed row can always be told from an imported or scanned one.
   */
  const openEntry = useCallback(
    async (
      category: string | null = null,
      payee: UpiPayee | null = null,
      /** The row a ledger card's Edit handed over, if this open is a correction. */
      editing: Row | null = null,
    ): Promise<string | null> => {
      // Set before the sheet opens, and before any await: the category, the payee and the row
      // being corrected are what the sheet starts on, and a tap that fetched the module first
      // would otherwise open a blank entry and only then be told what it was for.
      setEntryCategory(category)
      setEntryPayee(payee)
      setEntryEditing(editing)
      const answer = payee === null
        ? null
        : new Promise<string | null>((resolve) => {
            settleScan.current = resolve
          })
      if (!EntrySheet) {
        const module = await import("@/features/manual-entry")
        setEntrySheet(() => module.ManualEntrySheet)
      }
      setEntryOpen(true)
      return answer
    },
    [EntrySheet],
  )

  const addEntry = useCallback((entry: ManualEntry) => {
    // The sheet's own day: today unless the owner changed it, so a forgotten expense lands
    // on the day it happened rather than on the day it was remembered. The id carries that
    // moment too, and the random tail keeps two entries in the same minute apart.
    const at = entry.at
    const category = entry.category ?? DEFAULT_CATEGORY
    appendToLedger({
      rows: [
        {
          id: `manual-${at}-${Math.random().toString(36).slice(2, 8)}`,
          title: entry.merchant || filedName(category),
          category,
          account: entry.account,
          amountCents: Math.round(entry.amount * 100),
          // The sheet's Expense/Income switch decides the direction; `amountCents` stays a
          // positive number and every total reads the kind (`lib/derive.ts`), so an income
          // here is never counted as spending.
          kind: entry.kind,
          at,
          ...(entry.note ? { note: entry.note } : {}),
          source: "manual",
        },
      ],
    })
  }, [])

  /**
   * The sheet's confirm, in edit mode: the same row, corrected.
   *
   * Everything the sheet knows is written onto the row it started on — **the id stays**, which
   * is what makes this a correction rather than a second entry: the card keeps its place in
   * the ledger, the cloud's upsert lands on the same `client_id` (`lib/cloud.ts`), and every
   * total it was part of simply moves. Fields the sheet does not ask about ride along
   * untouched: an imported row keeps its Wallet id, its icon and its people, and a scanned
   * one keeps `source: "upi"`.
   */
  const editEntry = useCallback(
    (row: Row, entry: ManualEntry) => {
      const category = entry.category ?? DEFAULT_CATEGORY
      const next: Row = {
        ...row,
        title: entry.merchant || filedName(category),
        category,
        account: entry.account,
        amountCents: Math.round(entry.amount * 100),
        kind: entry.kind,
        // The moment is the row's own unless the pill was moved, and that is the point of
        // seeding the sheet with it: a backdated expense is corrected where it happened.
        at: entry.at,
      }
      // A note the owner cleared is gone rather than stored as an empty string: a row with no
      // note has no such key anywhere else in the app.
      if (entry.note) next.note = entry.note
      else delete next.note
      update(next)
    },
    [update],
  )

  /**
   * The sheet's confirm.
   *
   * One screen, two rows: a hand-typed entry is `addEntry`'s (`source: "manual"`, an id no
   * import can collide with), and an entry opened from a scanned code is the *payee's* —
   * `logPaidPayee` writes it through `logScan.ts`'s `rowFor`, so
   * the two ways into a scanned row cannot disagree about what one is. It also hands the
   * scanner its sentence, which is what the status line shows when the sheet closes. A scan
   * is always money out, so that screen never shows the sheet's kind switch: only the
   * add-record path can hand `addEntry` an income.
   */
  const submitEntry = useCallback(
    (entry: ManualEntry) => {
      if (entryEditing !== null) {
        editEntry(entryEditing, entry)
        return
      }
      if (entryPayee === null) {
        addEntry(entry)
        return
      }
      settleScan.current?.(
        logPaidPayee(entryPayee, {
          amountCents: Math.round(entry.amount * 100),
          category: entry.category ?? DEFAULT_CATEGORY,
          note: entry.note,
          title: entry.merchant,
          // The payment screen's own moment, which starts on now and can be moved back.
          at: entry.at,
        }),
      )
      settleScan.current = null
    },
    [addEntry, editEntry, entryEditing, entryPayee],
  )

  /**
   * Open the budget editor for one of the two budgets, fetching the panel first if this is
   * the first hold. The scope is set before the await, so a first hold still opens the panel
   * on the budget it was made on.
   */
  const editBudget = useCallback(
    async (scope: BudgetScope) => {
      setBudgetScope(scope)
      if (!BudgetEditor) {
        const module = await import("@/features/budget/BudgetSheet")
        setBudgetEditor(() => module.BudgetSheet)
      }
      setBudgetOpen(true)
    },
    [BudgetEditor],
  )

  /** Closing without confirming is an answer too: the scanner's hint comes back. */
  const closeEntry = useCallback(() => {
    setEntryOpen(false)
    setEntryEditing(null)
    settleScan.current?.(null)
    settleScan.current = null
  }, [])

  /**
   * A ledger card's hold → **Edit**: find the row the app actually holds and open the sheet on
   * it. The lookup is by the card's id, which is the row's own; a card whose row has gone (a
   * delete on another device, a pull that landed in between) opens nothing rather than a blank
   * sheet with somebody else's figures.
   */
  const editRow = useCallback(
    (id: string) => {
      const row = rows.find((candidate) => candidate.id === id)
      if (row) void openEntry(row.category, null, row)
    },
    [rows, openEntry],
  )

  /**
   * A balance card's hold: fetch the panel on the first one, then open it on that account.
   * The account id is set before the await, like every other panel here.
   */
  const editBalance = useCallback(
    async (accountId: string) => {
      setBalanceAccount(accountId)
      if (!BalanceEditor) {
        const module = await import("@/features/balance/BalanceSheet")
        setBalanceEditor(() => module.BalanceSheet)
      }
    },
    [BalanceEditor],
  )

  /**
   * Both models are rebuilt when the ledger changes and not on every render: the
   * derivation walks every row, and a screen that re-renders for a hover must not
   * make it do that.
   */
  const imported = hasHistory(rows)
  const dashboard = useMemo(
    () =>
      imported
        ? dashboardModel(rows, now, limits.food, tracked.food, openings)
        : demoDashboard(limits.food, tracked.food, openings),
    [imported, rows, now, limits.food, tracked.food, openings],
  )
  const ledger = useMemo(
    () => (imported ? ledgerModel(rows, budgets, anchor) : DEMO_LEDGER),
    [imported, rows, budgets, anchor],
  )

  const Ledger = arrived.ledger
  const Scan = arrived.scan
  const Stats = arrived.stats
  const Settings = arrived.settings

  return (
    <>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={view}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
        >
          {view === "dashboard" ? (
            <DashboardScreen
              model={dashboard}
              greeting={greeting}
              theme={theme}
              onToggleTheme={toggleTheme}
              onScan={() => void goTo("scan")}
              onAddRecord={() => void openEntry()}
              onQuickLog={(category) => void openEntry(category)}
              onSetBudget={() => void editBudget("food")}
              onEditBalance={(accountId) => void editBalance(accountId)}
            />
          ) : view === "ledger" && Ledger ? (
            <Ledger
              model={ledger}
              theme={theme}
              onToggleTheme={toggleTheme}
              onPickMonth={setAnchor}
              // The ledger screen only asks; the store is what forgets a row and tells every
              // screen subscribed to it (`lib/ledger.ts`).
              onDelete={remove}
              // …and an edit comes back the same way: the sheet is opened here, over the
              // ledger, with the row the app holds.
              onEdit={editRow}
            />
          ) : view === "stats" && Stats ? (
            <Stats
              rows={rows}
              theme={theme}
              onToggleTheme={toggleTheme}
              budgetCents={limits.total}
              budgetCategories={tracked.total}
              onSetBudget={() => void editBudget("total")}
            />
        ) : view === "scan" && Scan ? (
            <Scan
              theme={theme}
              onToggleTheme={toggleTheme}
              onBack={() => void goTo("dashboard")}
              // A scanned code opens the same sheet the dashboard's pill opens, as a payment
              // screen for this merchant — and its answer is the status line's sentence, so the
              // screen itself never touches the ledger.
              onOpenEntry={(payee) => openEntry(null, payee)}
            />
          ) : view === "settings" && Settings ? (
            <Settings
              theme={theme}
              onToggleTheme={toggleTheme}
              palette={palette}
              onChooseTheme={chooseTheme}
            />
          ) : null}
        </motion.div>
      </AnimatePresence>

      {/*
        The dock lives outside the cross-fade: it is the frame the screens change
        inside, not a fourth screen. `null` on the scanner leaves no tab marked.
      */}
      <BottomNav
        active={view === "scan" ? null : view}
        onChange={(tab) => void goTo(tab)}
      />

      {/* The one modal in the app: over the dock, and fetched on first use. */}
      {EntrySheet && (
        <EntrySheet
          isOpen={entryOpen}
          category={entryCategory}
          payee={entryPayee}
          editing={entryEditing}
          onClose={closeEntry}
          onSubmit={submitEntry}
        />
      )}

      {/*
        The budget editor. A long press on either budget card opens it on that budget — the
        dashboard's envelope is `food`, the stats dial is `total` — and the save writes the
        owner's number to `lib/budget.ts`, which is what redraws both cards.
      */}
      {BudgetEditor && (
        <BudgetEditor
          isOpen={budgetOpen}
          scope={budgetScope}
          limitCents={limits[budgetScope]}
          tracked={tracked[budgetScope]}
          // What the budget has counted so far this month, so the picker's own figure moves
          // on every toggle — re-derived here because the rows do not leave the app.
          spentCents={budgetSpent(rows, startOfMonth(now), startOfNextMonth(now), tracked[budgetScope])}
          onClose={() => setBudgetOpen(false)}
          onSave={(cents) => {
            saveBudget(budgetScope, cents)
            setBudgetOpen(false)
          }}
          // Written on every toggle rather than on the save: the card behind the panel is
          // the answer to what a choice does, so it has to move while the panel is open.
          onTrack={(categories) => saveTracked(budgetScope, categories)}
        />
      )}

      {/** The balance editor: what the card's hold opened, by account id. */}
      {BalanceEditor && (
        <BalanceEditor
          isOpen={balanceAccount !== null}
          name={dashboard.cards.find((card) => card.id === balanceAccount)?.name ?? "Account"}
          balanceCents={
            dashboard.cards.find((card) => card.id === balanceAccount)?.cents ?? 0
          }
          onClose={() => setBalanceAccount(null)}
          onSave={(cents) => {
            if (balanceAccount) setBalance(balanceAccount, cents)
            setBalanceAccount(null)
          }}
        />
      )}

    </>
  )
}

/**
 * The gate, and the reason the ledger above is a component rather than the default export.
 *
 * Three builds come out of one source:
 *
 * - **No Supabase values** (`mode === "device"`) — the tracker this app has always been. Nothing
 *   is fetched, nothing is gated, and `TrackIt` mounts on the first frame.
 * - **A project and no session** — the portal, because the account is what the ledger is filed
 *   under; there is nothing on this screen for somebody who is not signed in.
 * - **A project and a session** — `TrackIt`, reading the account's cache (which may be empty on a
 *   brand-new account, and is the last thing this device saw when the network is gone).
 *
 * The wait between boot and that decision is a bare canvas, not a splash: the session is read
 * from `localStorage` synchronously enough that a returning owner never sees it, and a logo held
 * for one frame is a promise the app cannot keep any faster than painting.
 */
export default function App() {
  const { mode, ready, user } = useAuth()

  if (mode === "device") return <TrackIt />
  if (!ready) return <div className="h-dvh w-full bg-canvas" aria-busy="true" />
  return user ? <TrackIt /> : <LoginScreen />
}
