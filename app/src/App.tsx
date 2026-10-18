import { AnimatePresence, motion } from "framer-motion"
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react"

import { BottomNav } from "@/components/BottomNav"
import { DashboardScreen } from "@/components/DashboardScreen"
// Types only, and that is what keeps the two screens below out of the entry chunk: an
// `import type` is erased, so nothing here fetches them until a tap does.
import type { Props as LedgerProps } from "@/components/LedgerScreen"
import type { Props as ScanProps } from "@/components/ScanScreen"
import type { Props as StatsProps } from "@/components/AnalyticsScreen"
// The sheet's types only. The component itself is fetched the first time the pill is
// pressed, so the entry chunk does not pay for a keypad most opens never open.
import type { ManualEntry, SheetProps } from "@/features/manual-entry"
import { logPaidPayee, logScannedPayee } from "@/features/upi/logScan"
import { useGreeting } from "@/hooks/useGreeting"
import { useLedger } from "@/hooks/useLedger"
import { useTheme } from "@/hooks/useTheme"
import { DEMO_DASHBOARD, DEMO_LEDGER } from "@/lib/demo"
import { categoryFor, DEFAULT_CATEGORY } from "@/lib/categories"
import { dashboardModel, hasHistory, ledgerModel } from "@/lib/derive"
import { appendToLedger } from "@/lib/ledger"

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
 * the design's own 0.35s, the constant its repaint uses.
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
 * the other two. What a read code becomes — one row, or a refusal — is
 * `features/upi/logScan.ts`, handed in as the screen's `onPayee` so that the screen
 * itself never touches the ledger.
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
 * The three screens that arrive when they are asked for. The named exports are the only reason
 * these are not plain `lazy` calls — a `lazy` component suspends on first render, and a
 * suspension is exactly what the cross-fade cannot carry.
 */
const screens = {
  ledger: () => import("@/components/LedgerScreen").then((screen) => screen.LedgerScreen),
  scan: () => import("@/components/ScanScreen").then((screen) => screen.ScanScreen),
  stats: () => import("@/components/AnalyticsScreen").then((screen) => screen.AnalyticsScreen),
} as const

type View = "dashboard" | "ledger" | "scan" | "stats"

/** Whichever of the lazy screens has arrived — normally all of them, from the idle fetch. */
type Arrived = {
  ledger?: ComponentType<LedgerProps>
  scan?: ComponentType<ScanProps>
  stats?: ComponentType<StatsProps>
}
export default function App() {
  const { theme, toggleTheme } = useTheme()
  const { rows, budgets } = useLedger()
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
      void import("@/features/manual-entry")
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
  const openEntry = useCallback(async () => {
    if (!EntrySheet) {
      const module = await import("@/features/manual-entry")
      setEntrySheet(() => module.ManualEntrySheet)
    }
    setEntryOpen(true)
  }, [EntrySheet])

  const addEntry = useCallback((entry: ManualEntry) => {
    const at = Date.now()
    const category = entry.category ?? DEFAULT_CATEGORY
    appendToLedger({
      rows: [
        {
          id: `manual-${at}-${Math.random().toString(36).slice(2, 8)}`,
          title: entry.merchant || categoryFor(category).label,
          category,
          account: entry.account,
          amountCents: Math.round(entry.amount * 100),
          kind: "expense",
          at,
          ...(entry.note ? { note: entry.note } : {}),
          source: "manual",
        },
      ],
    })
  }, [])

  /**
   * Both models are rebuilt when the ledger changes and not on every render: the
   * derivation walks every row, and a screen that re-renders for a hover must not
   * make it do that.
   */
  const imported = hasHistory(rows)
  const dashboard = useMemo(
    () => (imported ? dashboardModel(rows, budgets) : DEMO_DASHBOARD),
    [imported, rows, budgets],
  )
  const ledger = useMemo(
    () => (imported ? ledgerModel(rows, budgets, anchor) : DEMO_LEDGER),
    [imported, rows, budgets, anchor],
  )

  const Ledger = arrived.ledger
  const Scan = arrived.scan
  const Stats = arrived.stats

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
            />
          ) : view === "ledger" && Ledger ? (
            <Ledger
              model={ledger}
              theme={theme}
              onToggleTheme={toggleTheme}
            onPickMonth={setAnchor}
            />
          ) : view === "stats" && Stats ? (
          <Stats rows={rows} theme={theme} onToggleTheme={toggleTheme} />
        ) : view === "scan" && Scan ? (
            <Scan
              theme={theme}
              onToggleTheme={toggleTheme}
              onBack={() => void goTo("dashboard")}
              // Two ways a scanned code becomes a row, and both are handed in here so the
              // screen itself never touches the ledger: a code that carried its amount, and
              // what the money screen collected for one that did not.
              onPayee={logScannedPayee}
              onPaid={logPaidPayee}
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
        <EntrySheet isOpen={entryOpen} onClose={() => setEntryOpen(false)} onSubmit={addEntry} />
      )}
    </>
  )
}
