import { BookIcon, HomeIcon, PersonIcon, RefreshIcon } from '../lib/icons'

export type Tab = 'cours' | 'revision' | 'codex' | 'profil'

const TABS: { id: Tab; label: string; Icon: typeof HomeIcon }[] = [
  { id: 'cours', label: 'Cours', Icon: HomeIcon },
  { id: 'revision', label: 'Révision', Icon: RefreshIcon },
  { id: 'codex', label: 'Guide', Icon: BookIcon },
  { id: 'profil', label: 'Profil', Icon: PersonIcon },
]

interface TabBarProps {
  tab: Tab
  onTab: (t: Tab) => void
}

export function TabBar({ tab, onTab }: TabBarProps) {
  return (
    <nav className="tab-bar">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`tab-item${tab === id ? ' tab-item--active' : ''}`}
          aria-current={tab === id ? 'page' : undefined}
          onClick={() => onTab(id)}
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
