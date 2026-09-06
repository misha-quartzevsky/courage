import { useEffect, useState } from 'react'
import type { CefrLevel, TextListEntry } from '../lib/types'
import { loadRfiEpisodes, loadTextList, type RfiEpisode } from '../lib/texts'
import { AlertIcon } from '../lib/icons'

const WORKER_URL = (
  import.meta.env.VITE_GEMINI_WORKER_URL as string | undefined
)?.replace(/\/+$/, '')

// Курируемые подкасты для начинающих/средних — ссылаемся, не рехостим.
const PODCASTS: { title: string; note: string; url: string }[] = [
  { title: 'InnerFrench', note: 'B1–B2 · медленно, с транскриптами', url: 'https://innerfrench.com/podcast/' },
  { title: 'Coffee Break French', note: 'A1 → B2 · по сезонам', url: 'https://coffeebreaklanguages.com/coffeebreakfrench/' },
  { title: 'One Thing In A French Day', note: 'B1 · короткие эпизоды из жизни', url: 'https://www.onethinginafrenchday.com/' },
  { title: 'Duolingo French Podcast', note: 'A1–A2 · half EN/FR, транскрипты', url: 'https://podcast.duolingo.com/french' },
]

interface LireProps {
  onOpenText: (id: string) => void
}

const LEVEL_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2']

export function Lire({ onOpenText }: LireProps) {
  const [list, setList] = useState<TextListEntry[] | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const [rfi, setRfi] = useState<RfiEpisode[]>([])

  useEffect(() => {
    let alive = true
    loadTextList()
      .then((l) => {
        if (!alive) return
        setList(l)
        setStatus('ready')
      })
      .catch(() => alive && setStatus('error'))
    if (WORKER_URL) {
      loadRfiEpisodes(WORKER_URL)
        .then((e) => alive && setRfi(e))
        .catch(() => {
          /* фид недоступен (worker без роута /feed) — просто не показываем */
        })
    }
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

      {rfi.length > 0 && (
        <section className="text-list-group">
          <p className="eyebrow">RFI · Journal en français facile</p>
          <p className="muted section-hint" style={{ marginTop: 0 }}>
            Новости простым французским, ~10 мин. Открывается на сайте RFI —
            там есть синхронный транскрипт и регулируемая скорость.
          </p>
          {rfi.map((e) => (
            <a
              key={e.audioUrl}
              className="text-row"
              href={e.pageUrl || e.audioUrl}
              target="_blank"
              rel="noreferrer"
            >
              <span className="text-row-title">{e.title}</span>
              <span className="muted">{e.date}</span>
            </a>
          ))}
        </section>
      )}

      <section className="text-list-group">
        <p className="eyebrow">Подкасты — послушать вне приложения</p>
        {PODCASTS.map((p) => (
          <a
            key={p.url}
            className="text-row"
            href={p.url}
            target="_blank"
            rel="noreferrer"
          >
            <span className="text-row-title">{p.title}</span>
            <span className="muted">{p.note}</span>
          </a>
        ))}
      </section>
    </main>
  )
}
