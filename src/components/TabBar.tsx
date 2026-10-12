export type Tab = 'home' | 'settings'

type Props = {
  tab: Tab
  onTab: (tab: Tab) => void
  onAdd: () => void
}

export function TabBar({ tab, onTab, onAdd }: Props) {
  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav__inner">
        <button
          type="button"
          className={`nav__item ${tab === 'home' ? 'nav__item--active' : ''}`}
          aria-current={tab === 'home' ? 'page' : undefined}
          onClick={() => onTab('home')}
        >
          <span className="nav__icon" aria-hidden>
            🏠
          </span>
          Home
        </button>

        <div className="nav__spacer" aria-hidden />

        <button
          type="button"
          className={`nav__item ${tab === 'settings' ? 'nav__item--active' : ''}`}
          aria-current={tab === 'settings' ? 'page' : undefined}
          onClick={() => onTab('settings')}
        >
          <span className="nav__icon" aria-hidden>
            ⚙️
          </span>
          Settings
        </button>

        <button type="button" className="fab" onClick={onAdd} aria-label="Add expense">
          +
        </button>
      </div>
    </nav>
  )
}
