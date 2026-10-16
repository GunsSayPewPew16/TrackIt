import { AnimatePresence, motion } from "framer-motion"
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react"

import { DashboardScreen } from "@/components/DashboardScreen"
// Types only, and that is what keeps the two screens below out of the entry chunk: an
// `import type` is erased, so nothing here fetches them until a tap does.
import type { Props as LedgerProps } from "@/components/LedgerScreen"
import type { Props as ScanProps } from "@/components/ScanScreen"
import { logScannedPayee } from "@/features/upi/logScan"
import { useGreeting } from "@/hooks/useGreeting"
import { useLedger } from "@/hooks/useLedger"
import { useTheme } from "@/hooks/useTheme"
import { DEMO_DASHBOARD, DEMO_LEDGER } from "@/lib/demo"
import { dashboardModel, hasHistory, ledgerModel } from "@/lib/derive"

/**
 * The app: three screens, and the state that decides what they show.
 *
 * **The greeting is the one thing here that is neither.** It is a different language
 * every time the app is opened — the owner's ask — so it is chosen once per load by
 * `useGreeting`, from the pool in `lib/greetings.ts` and, where there is a key for it,
 * from a model. That is why it is a prop rather than a field of the dashboard model:
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
 * **Where the ledger opens.** The wheel is a fifteen-day window, so the month menu
 * on the ledger screen is what reaches further back: this holds the day the window
 * ends on, and `ledgerModel` builds the fortnight behind it. With no anchor the
 * window ends on the newest row, which is what the owner came to see.
 *
 * **Where a screen starts.** At its top, every time. The way back is pressed from
 * the foot of the ledger's rows, and on a short window either screen scrolls, so the
 * browser would otherwise hand the new one the old one's scroll offset — the dashboard
 * opening halfway down its cards, or the ledger past a day the owner has not seen.
 * `scrollTo` is instant rather than smooth on purpose: this is not a movement the
 * owner asked for, and the cross-fade is what carries the change of screen.
 *
 * **The scanner is a screen too.** The dashboard's scan square opens it the same way
 * the header's circle opens the ledger, and it wears the second artboard's design
 * (`components/ScanScreen.tsx`) rather than the dialog the previous app opened: it
 * has its own header and its own way back, and the cross-fade carries the change like
 * the other two. What a read code becomes — one row, or a refusal — is
 * `features/upi/logScan.ts`, handed in as the screen's `onPayee` so that the screen
 * itself never touches the ledger.
 *
 * **The ledger is opened from the header's circle**, and importing is not reachable
 * from the UI at all at the moment: `components/DataSheet.tsx` is written and unwired,
 * waiting for the owner to place it. The import path behind it (`useLedger`'s
 * `importHistory`) still works the moment something calls it.
 *
 * **Only the dashboard is in the file that must arrive before the first pixel.** Nothing
 * renders until this module runs, so everything it imports is a cost the owner pays before
 * seeing anything — and the other two screens sit behind a tap most opens never make. They
 * are two chunks of their own for that reason: the ledger's month menu is the app's only
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
 * The two screens that arrive when they are asked for. The named exports are the only reason
 * these are not plain `lazy` calls — a `lazy` component suspends on first render, and a
 * suspension is exactly what the cross-fade cannot carry.
 */
const screens = {
  ledger: () => import("@/components/LedgerScreen").then((screen) => screen.LedgerScreen),
  scan: () => import("@/components/ScanScreen").then((screen) => screen.ScanScreen),
} as const

type View = "dashboard" | "ledger" | "scan"

/** Whichever of the two lazy screens has arrived — normally both, from the idle fetch. */
type Arrived = {
  ledger?: ComponentType<LedgerProps>
  scan?: ComponentType<ScanProps>
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
   * After the first screen is painted, the other two are fetched in the background, so a tap
   * the owner has not made yet is not a tap that waits. This is the one place the app
   * deliberately downloads something nobody has asked to see, and it is idly scheduled so
   * that a slow phone finishes its first paint first.
   */
  useEffect(() => {
    const warm = () => {
      void screens.ledger()
      void screens.scan()
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

  return (
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
            onOpenLedger={() => void goTo("ledger")}
            onScan={() => void goTo("scan")}
          />
        ) : view === "ledger" && Ledger ? (
          <Ledger
            model={ledger}
            theme={theme}
            onToggleTheme={toggleTheme}
            onBack={() => void goTo("dashboard")}
            onPickMonth={setAnchor}
          />
        ) : view === "scan" && Scan ? (
          <Scan
            theme={theme}
            onToggleTheme={toggleTheme}
            onBack={() => void goTo("dashboard")}
            onPayee={logScannedPayee}
          />
        ) : null}
      </motion.div>
    </AnimatePresence>
  )
}
