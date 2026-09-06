import { useEffect, useState } from 'react'
import type { CefrLevel, TextListEntry } from '../lib/types'
import { loadTextList } from '../lib/texts'
import { AlertIcon } from '../lib/icons'

interface LireProps {
  onOpenText: (id: string) => void
}

const LEVEL_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2']

export function Lire({ onOpenText }: LireProps) {
  const [list, setList] = useState<TextListEntry[] | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let alive = true
    loadTextList()
      .then((l) => {
        if (!alive) return
        setList(l)
        setStatus('ready')
      })
      .catch(() => alive && setStatus('error'))
    return () => {
      alive = false
    }
  }, [])

  const byLevel = LEVEL_ORDER.map((lvl) => ({
    lvl,
    items: (list ?? []).filter((t) => t.level === lvl),
  })).filter((g) => g.items.length > 0)

  return (
    <main className="screen">
      <header>
        <h1 className="app-title">Чтение</h1>
        <p className="muted">
          Короткие тексты с озвучкой. Нажмите на слово — покажем перевод и
          добавим в ваши слова.
        </p>
      </header>

      {status === 'loading' && <p className="muted">Загружаю…</p>}
      {status === 'error' && (
        <p className="error">
          <AlertIcon />
          Не удалось загрузить список текстов.
        </p>
      )}

      {byLevel.map((g) => (
        <section key={g.lvl} className="text-list-group">
          <p className="eyebrow">Уровень {g.lvl}</p>
          {g.items.map((t) => (
            <button
              key={t.id}
              type="button"
              className="text-row"
              onClick={() => onOpenText(t.id)}
            >
              <span className="text-row-title">{t.title.fr}</span>
              <span className="muted">
                {t.title.ru}
                {' · '}
                {t.hasAudio ? `аудио ${t.durationSec ?? ''}с` : 'без озвучки'}
              </span>
            </button>
          ))}
        </section>
      ))}

      {status === 'ready' && byLevel.length === 0 && (
        <section className="card">
          <p className="muted">Пока нет текстов.</p>
        </section>
      )}

      <p className="muted section-hint">
        Больше текстов и подкасты — в следующих обновлениях.
      </p>
    </main>
  )
}
