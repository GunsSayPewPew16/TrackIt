import { useCallback, useEffect, useState } from 'react'
import { AddExpenseSheet } from './components/AddExpenseSheet'
import { CardsScreen } from './components/CardsScreen'
import { HomeScreen } from './components/HomeScreen'
import { OperationsScreen } from './components/OperationsScreen'
import { QrScanner } from './components/QrScanner'
import { SettingsScreen } from './components/SettingsScreen'
import { StatisticsScreen } from './components/StatisticsScreen'
import { TabBar, type Tab } from './components/TabBar'
import { UpiPaySheet } from './components/UpiPaySheet'
import { useExpenses } from './hooks/useExpenses'
import { todayISO } from './lib/format'
import { DEFAULT_CURRENCY } from './lib/types'
import type { UpiPayee } from './lib/upi'

/**
 * Where the scanner is in its short life: off, looking, or holding a payee.
 *
 * The camera and the pay sheet are never both mounted — reading a code unmounts
 * the scanner, which is what releases the camera — so this is one value rather
 * than two flags that could disagree.
 */
type ScanState = { phase: 'off' } | { phase: 'scanning' } | { phase: 'paying'; payee: UpiPayee }

/** The manifest's shortcuts deep-link with `?action=…`. */
function requestedAction(): string | null {
  return new URLSearchParams(window.location.search).get('action')
}

export default function App() {
  const { expenses, loading, add, remove, reload, sync } = useExpenses()
  const [tab, setTab] = useState<Tab>('home')
  const [sheetOpen, setSheetOpen] = useState(() => requestedAction() === 'add')
  const [opsOpen, setOpsOpen] = useState(false)
  // "Scan & pay" is a shortcut on the phone's home screen, so the scanner can
  // be the first thing the app opens — that is the whole point of it.
  const [scan, setScan] = useState<ScanState>(() =>
    requestedAction() === 'scan' ? { phase: 'scanning' } : { phase: 'off' },
  )

  useEffect(() => {
    // Reflect the deep link into state above, then drop it from the URL so a
    // refresh doesn't reopen the sheet or the camera.
    if (requestedAction()) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const currency = expenses[0]?.currency ?? DEFAULT_CURRENCY

  /**
   * The rail's third entry is the add flow, which in this app is a sheet rather
   * than a screen: tapping it opens the sheet and leaves the rail where it was.
   */
  const handleTab = useCallback((next: Tab) => {
    if (next === 'add') {
      setSheetOpen(true)
      return
    }
    setTab(next)
  }, [])

  const startScan = useCallback(() => setScan({ phase: 'scanning' }), [])
  const stopScan = useCallback(() => setScan({ phase: 'off' }), [])

  /**
   * Log the expense the owner just confirmed.
   *
   * This runs *before* the payment is handed to the UPI app, and that order is
   * deliberate: the payment app never reports back, so this row is the only
   * record that the owner was about to pay someone. `source` marks it as one of
   * those rows, which is also how a later feature could ask "did you pay this?".
   */
  const logUpiExpense = useCallback(
    async (payee: UpiPayee, draft: { amountCents: number; category: string; note: string }) => {
      await add({
        amountCents: draft.amountCents,
        kind: 'expense',
        category: draft.category,
        // The payee is what the ledger needs even when the note is cleared:
        // "₹209 · Swiggy" beats "₹209" with no idea who took it.
        note: draft.note.trim() || payee.pn,
        spentAt: todayISO(),
        currency,
        source: 'upi',
      })
    },
    [add, currency],
  )

  return (
    <div className="app">
      {tab === 'home' && (
        <HomeScreen
          expenses={expenses}
          loading={loading}
          onDelete={remove}
          onSync={sync}
          onScan={startScan}
          onOperations={() => setOpsOpen(true)}
          onCards={() => setTab('cards')}
        />
      )}

      {tab === 'statistics' && <StatisticsScreen expenses={expenses} />}

      {tab === 'cards' && <CardsScreen />}

      {tab === 'profile' && (
        <SettingsScreen expenses={expenses} onSync={sync} onReload={reload} />
      )}

      <TabBar tab={tab} onTab={handleTab} />

      {opsOpen && (
        <OperationsScreen
          expenses={expenses}
          onClose={() => setOpsOpen(false)}
          onTransfer={() => {
            // The page's own Transfer pill is the same action Home's is, so it
            // closes the page on the way to the camera rather than scanning
            // behind it.
            setOpsOpen(false)
            startScan()
          }}
          onAdd={() => {
            setOpsOpen(false)
            setSheetOpen(true)
          }}
        />
      )}

      {scan.phase === 'scanning' && (
        <QrScanner onPayee={(payee) => setScan({ phase: 'paying', payee })} onCancel={stopScan} />
      )}

      {scan.phase === 'paying' && (
        <UpiPaySheet
          payee={scan.payee}
          currency={currency}
          onPay={(draft) => logUpiExpense(scan.payee, draft)}
          onCancel={stopScan}
        />
      )}

      {sheetOpen && (
        <AddExpenseSheet
          currency={currency}
          onClose={() => setSheetOpen(false)}
          onSave={async (draft) => {
            await add(draft)
            setSheetOpen(false)
          }}
        />
      )}
    </div>
  )
}
