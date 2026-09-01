import { useEffect, useMemo, useState } from 'react'
import type { WordRecord } from '../lib/types'
import { isLearned } from '../lib/storage'
import {
  loadDictionary,
  normFr,
  searchDictionary,
  type DictEntry,
} from '../lib/dictionary'
import { speakFr } from '../lib/speech'
import { AlertIcon, SearchIcon, SpeakerIcon } from '../lib/icons'

interface DictionaryProps {
  userWords: WordRecord[]
  onToggle: (fr: string, ru?: string) => void
}

type Filter = 'all' | 'mine' | 'new' | 'learned'

const PAGE = 80

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'mine', label: 'Мои' },
  { id: 'new', label: 'Новые' },
  { id: 'learned', label: 'Пройдено' },
]

interface Row {
  f: string
  r: string
  rec?: WordRecord
}

export function Dictionary({ userWords, onToggle }: DictionaryProps) {
  const [entries, setEntries] = useState<DictEntry[] | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [visible, setVisible] = useState(PAGE)

  useEffect(() => {
    let alive = true
    loadDictionary()
      .then((data) => {
        if (!alive) return
        setEntries(data)
        setStatus('ready')
      })
      .catch(() => alive && setStatus('error'))
    return () => {
      alive = false
    }
  }, [])

  const q = query.trim()
  useEffect(() => setVisible(PAGE), [q, filter])

  const counts = useMemo(() => {
    let learned = 0
    for (const w of userWords) if (isLearned(w)) learned++
    return { total: userWords.length, learned, fresh: userWords.length - learned }
  }, [userWords])

  // Слова ученика (с учётом фильтра и поиска) — всегда сверху.
  const mineRows = useMemo<Row[]>(() => {
    let ws = [...userWords].sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1))
    if (filter === 'new') ws = ws.filter((w) => !isLearned(w))
    else if (filter === 'learned') ws = ws.filter((w) => isLearned(w))
    if (q) {
      const nq = normFr(q)
      const lq = q.toLowerCase()
      ws = ws.filter(
        (w) => normFr(w.fr).includes(nq) || w.ru.toLowerCase().includes(lq),
      )
    }
    return ws.map((w) => ({ f: w.fr, r: w.ru, rec: w }))
  }, [userWords, filter, q])

  // Большой встроенный словарь — только на фильтре «Все», без дублей со «своими».
  const dictRows = useMemo<Row[]>(() => {
    if (filter !== 'all' || !entries) return []
    const mineKeys = new Set(userWords.map((w) => normFr(w.fr)))
    const base = q ? searchDictionary(entries, q, 400) : entries
    const out: Row[] = []
    for (const e of base) {
      if (mineKeys.has(normFr(e.f))) continue
      out.push({ f: e.f, r: e.r })
    }
    return out
  }, [entries, filter, q, userWords])

  const rows = useMemo(() => [...mineRows, ...dictRows], [mineRows, dictRows])
  const shown = rows.slice(0, visible)

  return (
    <main className="screen">
      <header>
        <h1 className="app-title">Словарь</h1>
        <p className="muted">
          {status === 'ready' && entries
            ? `${entries.length.toLocaleString('ru')} слов · встречено ${counts.total} · пройдено ${counts.learned}`
            : 'Французско-русский словарь'}
        </p>
      </header>

      <div className="search-field">
        <SearchIcon />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти французское или русское слово…"
        />
      </div>

      <div className="chips dict-filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`token${filter === f.id ? ' token--picked' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {status === 'loading' && (
        <p className="muted section-hint">
          <span className="spinner" /> Загружаю словарь…
        </p>
      )}

      {status === 'error' && (
        <p className="error">
          <AlertIcon />
          Не удалось загрузить словарь. Проверьте соединение и откройте вкладку
          снова.
        </p>
      )}

      {status === 'ready' && shown.length === 0 && (
        <p className="muted section-hint">
          {q ? 'Ничего не нашлось' : 'Слова появятся после первого урока.'}
        </p>
      )}

      {shown.length > 0 && (
        <ul className="dict-list">
          {shown.map((row) => (
            <DictRow key={row.f} row={row} onToggle={onToggle} />
          ))}
        </ul>
      )}

      {rows.length > visible && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setVisible((v) => v + PAGE * 4)}
        >
          Показать ещё
        </button>
      )}

      <p className="dict-attribution muted">
        Словарь: WikDict (CC BY-SA 3.0), на основе Wiktionary.
      </p>
    </main>
  )
}

function DictRow({
  row,
  onToggle,
}: {
  row: Row
  onToggle: (fr: string, ru?: string) => void
}) {
  const learned = row.rec ? isLearned(row.rec) : false
  const seenNew = !!row.rec && !learned
  const cls = learned
    ? 'dict-row dict-row--learned'
    : seenNew
      ? 'dict-row dict-row--new'
      : 'dict-row'

  return (
    <li className={cls}>
      <button
        type="button"
        className="btn-icon"
        aria-label={`Озвучить: ${row.f}`}
        onClick={() => speakFr(row.f)}
      >
        <SpeakerIcon />
      </button>
      <button
        type="button"
        className="dict-row-text"
        onClick={() => onToggle(row.f, row.r)}
        aria-label={
          learned ? `${row.f}: снять «пройдено»` : `${row.f}: отметить «пройдено»`
        }
      >
        <span className="serif">{row.f}</span>
        <span className="muted"> — {row.r}</span>
        {learned && <span className="dict-status">пройдено</span>}
      </button>
    </li>
  )
}
