import { HomeIcon, ListIcon, PersonIcon, ReadIcon } from '../lib/icons'

export type Tab = 'today' | 'lire' | 'mots' | 'profil'

const TABS: { id: Tab; label: string; Icon: typeof HomeIcon }[] = [
  { id: 'today', label: 'Сегодня', Icon: HomeIcon },
  { id: 'lire', label: 'Чтение', Icon: ReadIcon },
  { id: 'mots', label: 'Слова', Icon: ListIcon },
  { id: 'profil', label: 'Профиль', Icon: PersonIcon },
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
