import { useEffect, useRef, useState } from 'react'
import type { SyncResult } from '../lib/sync'
import type { Expense, ExpenseSource } from '../lib/types'
import { DEFAULT_CURRENCY } from '../lib/types'
import { getToken, saveToken } from '../lib/api'
import {
  clearExpenses,
  isPersisted,
  putMany,
  storageEstimate,
} from '../lib/db'

type Props = {
  expenses: Expense[]
  onSync: () => Promise<SyncResult>
  onReload: () => Promise<void> | void
}

type Status = { kind: 'ok' | 'error'; message: string } | null

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function toCsv(expenses: Expense[]): string {
  const header = ['date', 'amount', 'currency', 'category', 'note', 'source', 'id']
  const rows = expenses.map((item) => [
    item.spentAt,
    (item.amountCents / 100).toFixed(2),
    item.currency,
    item.category,
    item.note,
    item.source,
    item.id,
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}

function download(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function normalizeImported(raw: unknown): Expense[] {
  if (!Array.isArray(raw)) throw new Error('File must contain a JSON array.')
  const sources: ExpenseSource[] = ['manual', 'shortcut']
  return raw.map((entry) => {
    const item = entry as Record<string, unknown>
    const amountCents =
      typeof item.amountCents === 'number'
        ? Math.round(item.amountCents)
        : Math.round(Number(item.amount) * 100)
    if (!item.id || !Number.isFinite(amountCents)) {
      throw new Error('Every record needs an id and a numeric amount.')
    }
    const spentAt =
      typeof item.spentAt === 'string'
        ? item.spentAt
        : typeof item.date === 'string'
          ? item.date
          : new Date().toISOString().slice(0, 10)
    const now = new Date().toISOString()
    const source = sources.includes(item.source as ExpenseSource)
      ? (item.source as ExpenseSource)
      : 'manual'
    return {
      id: String(item.id),
      amountCents,
      currency: typeof item.currency === 'string' ? item.currency : DEFAULT_CURRENCY,
      category: typeof item.category === 'string' ? item.category : 'other',
      note: typeof item.note === 'string' ? item.note : '',
      spentAt,
      source,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
    }
  })
}

export function SettingsScreen({ expenses, onSync, onReload }: Props) {
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<Status>(null)
  const [syncing, setSyncing] = useState(false)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [usage, setUsage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      const [storedToken, persistedNow, usageNow] = await Promise.all([
        Promise.resolve(getToken()),
        isPersisted(),
        storageEstimate(),
      ])
      if (!active) return
      setToken(storedToken)
      setPersisted(persistedNow)
      setUsage(usageNow)
    })()
    return () => {
      active = false
    }
  }, [])

  const endpoint = `${window.location.origin}/api/expense`

  async function handleSync() {
    setSyncing(true)
    setStatus(null)
    try {
      saveToken(token.trim())
      const result = await onSync()
      setStatus({
        kind: 'ok',
        message: `Synced — pushed ${result.pushed}, pulled ${result.pulled}.`,
      })
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Sync failed.',
      })
    } finally {
      setSyncing(false)
    }
  }

  async function handleImport(file: File) {
    try {
      const parsed = normalizeImported(JSON.parse(await file.text()))
      await putMany(parsed)
      await onReload()
      setStatus({ kind: 'ok', message: `Imported ${parsed.length} expenses.` })
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Import failed.',
      })
    }
  }

  async function handleClear() {
    if (!window.confirm('Delete every expense on this device?')) return
    await clearExpenses()
    await onReload()
    setStatus({ kind: 'ok', message: 'All local expenses deleted.' })
  }

  return (
    <>
      <header className="app-header">
        <h1 className="app-header__title">Settings</h1>
        <p className="app-header__subtitle">
          {expenses.length} expense{expenses.length === 1 ? '' : 's'} on this device
        </p>
      </header>

      <main className="screen">
        <div className="settings-group">
          <h2>Add to Home Screen</h2>
          <div className="card">
            <ol className="install-steps">
              <li>Open this site in Safari.</li>
              <li>
                Tap the <strong>Share</strong> button.
              </li>
              <li>
                Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
              </li>
            </ol>
            <p className="hint">
              Launching from the Home Screen runs TrackIt full-screen and helps
              iOS keep your expense data from being evicted.
            </p>
          </div>
        </div>

        <div className="settings-group">
          <h2>Apple Shortcuts sync</h2>
          <div className="card">
            <div className="field">
              <label className="field__label" htmlFor="token">
                API token
              </label>
              <input
                id="token"
                className="input"
                type="password"
                placeholder="Paste the token from your Worker secrets"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>

            <div className="field">
              <span className="field__label">Shortcut endpoint</span>
              <input className="input" value={endpoint} readOnly />
            </div>

            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void handleSync()}
              disabled={syncing}
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>

            {status && (
              <p className={`status status--${status.kind}`}>{status.message}</p>
            )}

            <p className="hint">
              In Shortcuts, use <code>Get Contents of URL</code> with method{' '}
              <code>POST</code>, header <code>Authorization: Bearer &lt;token&gt;</code>,
              and a JSON body like{' '}
              <code>{'{ "amount": 12.50, "category": "food" }'}</code>.
            </p>
          </div>
        </div>

        <div className="settings-group">
          <h2>Backup</h2>
          <div className="card">
            <div className="settings-item" style={{ borderBottom: '1px solid var(--border)', padding: '0 0 14px' }}>
              <div>
                <div className="settings-item__label">Export data</div>
                <div className="settings-item__desc">
                  Keep a copy outside the browser.
                </div>
              </div>
            </div>
            <div className="btn-row" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  download(
                    `trackit-${new Date().toISOString().slice(0, 10)}.json`,
                    JSON.stringify(expenses, null, 2),
                    'application/json',
                  )
                }
              >
                Export JSON
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  download(
                    `trackit-${new Date().toISOString().slice(0, 10)}.csv`,
                    toCsv(expenses),
                    'text/csv',
                  )
                }
              >
                Export CSV
              </button>
            </div>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn"
                onClick={() => fileRef.current?.click()}
              >
                Import JSON
              </button>
              <button type="button" className="btn btn--danger" onClick={() => void handleClear()}>
                Clear all
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void handleImport(file)
                event.target.value = ''
              }}
            />
          </div>
        </div>

        <div className="settings-group">
          <h2>Storage</h2>
          <div className="card">
            <div className="settings-item">
              <span className="settings-item__label">Persistent storage</span>
              <span className="settings-item__desc">
                {persisted === null ? 'Checking…' : persisted ? 'Granted' : 'Not granted'}
              </span>
            </div>
            <div className="settings-item">
              <span className="settings-item__label">Local usage</span>
              <span className="settings-item__desc">{usage ?? 'Unknown'}</span>
            </div>
          </div>
          <p className="hint">
            TrackIt is local-first: everything stays on this device until you sync.
          </p>
        </div>
      </main>
    </>
  )
}
