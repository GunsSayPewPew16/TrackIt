import { useEffect, useState } from 'react'
import { AddExpenseSheet } from './components/AddExpenseSheet'
import { HomeScreen } from './components/HomeScreen'
import { SettingsScreen } from './components/SettingsScreen'
import { TabBar, type Tab } from './components/TabBar'
import { useExpenses } from './hooks/useExpenses'
import { DEFAULT_CURRENCY } from './lib/types'

/** The manifest's "Add" shortcut deep-links to /?action=add. */
function openedWithAddAction(): boolean {
  return new URLSearchParams(window.location.search).get('action') === 'add'
}

export default function App() {
  const { expenses, loading, add, remove, reload, sync } = useExpenses()
  const [tab, setTab] = useState<Tab>('home')
  const [sheetOpen, setSheetOpen] = useState(openedWithAddAction)

  useEffect(() => {
    // Reflect the deep link into state above, then drop it from the URL so a
    // refresh doesn't reopen the sheet.
    if (new URLSearchParams(window.location.search).has('action')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const currency = expenses[0]?.currency ?? DEFAULT_CURRENCY

  return (
    <div className="app">
      {tab === 'home' ? (
        <HomeScreen expenses={expenses} loading={loading} onDelete={remove} />
      ) : (
        <SettingsScreen expenses={expenses} onSync={sync} onReload={reload} />
      )}

      <TabBar tab={tab} onTab={setTab} onAdd={() => setSheetOpen(true)} />

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
