import { AnimatePresence, motion } from "framer-motion"
import { useCallback, useMemo, useState } from "react"

import { DashboardScreen } from "@/components/DashboardScreen"
import { LedgerScreen } from "@/components/LedgerScreen"
import { ScanSheet } from "@/components/ScanSheet"
import { useLedger } from "@/hooks/useLedger"
import { useTheme } from "@/hooks/useTheme"
import { DEMO_DASHBOARD, DEMO_LEDGER } from "@/lib/demo"
import { dashboardModel, hasHistory, ledgerModel } from "@/lib/derive"

/**
 * The app: two screens, and the state that decides what they show.
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
 * The scan sheet is the app's, not the design's — a dialog is a dialog, and Radix is
 * what makes it one — and it is opened from the dashboard's scan square, which is why
 * it is mounted here rather than inside a screen.
 *
 * **The ledger is opened from the header's circle**, and importing is not reachable
 * from the UI at all at the moment: `components/DataSheet.tsx` is written and unwired,
 * waiting for the owner to place it. The import path behind it (`useLedger`'s
 * `importHistory`) still works the moment something calls it.
 */
export default function App() {
  const { theme, toggleTheme } = useTheme()
  const { rows, budgets } = useLedger()
  const [view, setView] = useState<"dashboard" | "ledger">("dashboard")
  /** The day the wheel's window ends on; `undefined` means "the newest row". */
  const [anchor, setAnchor] = useState<number | undefined>(undefined)
  const [scanOpen, setScanOpen] = useState(false)

  /** Change screens, whichever way, and start the new one at its own top. */
  const goTo = useCallback((next: "dashboard" | "ledger") => {
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
              theme={theme}
              onToggleTheme={toggleTheme}
              onOpenLedger={() => goTo("ledger")}
              onScan={() => setScanOpen(true)}
            />
          ) : (
            <LedgerScreen
              model={ledger}
              theme={theme}
              onToggleTheme={toggleTheme}
              onBack={() => goTo("dashboard")}
              onPickMonth={setAnchor}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {scanOpen && <ScanSheet onClose={() => setScanOpen(false)} />}
    </>
  )
}
