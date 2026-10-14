import { HouseIcon } from '../lib/ui-icons'

/**
 * The rail: five glyphs under a translucent pill, with the active one in the
 * gold disc Home's design draws — a disc that is *meant* to sit proud of the
 * bar's top edge, so nothing here may clip it.
 *
 * The glyphs are the mockup's, in the mockup's order. Lucide ships no spiral and
 * no circled bolt, so the second and third are the closest drawings the family
 * has (`loader-pinwheel`, `zap`) — the same substitution the mockup made, kept
 * here so the two clients show the same five icons.
 *
 * The third entry is the add flow. In the app that is a sheet rather than a
 * screen, so `App` opens the sheet when it is tapped and the rail keeps showing
 * wherever the owner already was: a modal is not a tab.
 */

export type Tab = 'home' | 'statistics' | 'add' | 'cards' | 'profile'

type Props = {
  tab: Tab
  onTab: (tab: Tab) => void
}

function SwirlIcon() {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
      <path d="M22 12a1 1 0 0 1-10 0 1 1 0 0 0-10 0" />
      <path d="M7 20.7a1 1 0 1 1 5-8.7 1 1 0 1 0 5-8.6" />
      <path d="M7 3.3a1 1 0 1 1 5 8.6 1 1 0 1 0 5 8.6" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  )
}

function BoltIcon() {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
      <path d="M15.914 4a1.5 1.5 0 0 0-2.474-1.561l-9 9A1.5 1.5 0 0 0 5.5 14h4.002a.5.5 0 0 1 .471.666L8.086 20a1.5 1.5 0 0 0 2.475 1.56l9-9A1.5 1.5 0 0 0 18.5 10h-3.997a.5.5 0 0 1-.472-.667z" />
    </svg>
  )
}

function WalletIcon() {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  )
}

const ITEMS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <HouseIcon /> },
  { id: 'statistics', label: 'Statistics', icon: <SwirlIcon /> },
  { id: 'add', label: 'Add expense', icon: <BoltIcon /> },
  { id: 'cards', label: 'Cards', icon: <WalletIcon /> },
  { id: 'profile', label: 'Profile', icon: <PersonIcon /> },
]

export function TabBar({ tab, onTab }: Props) {
  return (
    <div className="nav-wrap">
      <nav className="bottom-nav" aria-label="Primary">
        {ITEMS.map((item) => {
          const active = item.id === tab
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              title={item.label}
              onClick={() => onTab(item.id)}
            >
              {item.icon}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
