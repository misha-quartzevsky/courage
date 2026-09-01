import { useEffect, useMemo, useState } from 'react'
import type { WordRecord } from '../lib/types'
import { isLearned } from '../lib/storage'
import { getRule } from '../lib/grammar'
import {
  loadDictionary,
  loadThemedDict,
  normFr,
  searchDictionary,
  type DictEntry,
  type ThemedEntry,
} from '../lib/dictionary'
import { speakFr } from '../lib/speech'
import { AlertIcon, SearchIcon, SpeakerIcon } from '../lib/icons'

interface DictionaryProps {
  userWords: WordRecord[]
  onToggle: (fr: string, ru?: string) => void
}

type Mode = 'themes' | 'search'
type Filter = 'all' | 'mine' | 'new' | 'learned'

const PAGE = 80
const NO_THEME = 'Разное'

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
  level?: string
}

interface Group {
  key: string
  title: string
  level?: string
  rows: Row[]
}

export function Dictionary({ userWords, onToggle }: DictionaryProps) {
  const [themed, setThemed] = useState<ThemedEntry[] | null>(null)
  const [wik, setWik] = useState<DictEntry[] | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [wikStatus, setWikStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [mode, setMode] = useState<Mode>('themes')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [visible, setVisible] = useState(PAGE)

  useEffect(() => {
    let alive = true
    loadThemedDict()
      .then((data) => alive && (setThemed(data), setStatus('ready')))
      .catch(() => alive && setStatus('error'))
    return () => {
      alive = false
    }
  }, [])

  // Большой WikDict нужен только для поиска — грузим лениво при входе в «Поиск».
  useEffect(() => {
    if (mode !== 'search' || wik || wikStatus === 'loading') return
    setWikStatus('loading')
    loadDictionary()
      .then((data) => {
        setWik(data)
        setWikStatus('ready')
      })
      .catch(() => setWikStatus('error'))
  }, [mode, wik, wikStatus])

  const q = query.trim()
  useEffect(() => setVisible(PAGE), [q, filter, mode])

  const counts = useMemo(() => {
    let learned = 0
    for (const w of userWords) if (isLearned(w)) learned++
    return { total: userWords.length, learned }
  }, [userWords])

  // Статус ученика по французскому слову (для наложения на ядро/поиск).
  const recByFr = useMemo(() => {
    const m = new Map<string, WordRecord>()
    for (const w of userWords) m.set(normFr(w.fr), w)
    return m
  }, [userWords])

  // «Мои слова» — сгруппированы по правилу-фокусу урока (sla-methods.md).
  const mineGroups = useMemo<Group[]>(() => {
    let ws = [...userWords]
    if (filter === 'new') ws = ws.filter((w) => !isLearned(w))
    else if (filter === 'learned') ws = ws.filter((w) => isLearned(w))
    if (q) {
      const nq = normFr(q)
      const lq = q.toLowerCase()
      ws = ws.filter(
        (w) => normFr(w.fr).includes(nq) || w.ru.toLowerCase().includes(lq),
      )
    }
    const byTheme = new Map<string, { newest: string; rows: Row[] }>()
    for (const w of ws) {
      const key = w.ruleId ?? ''
      const g = byTheme.get(key)
      const row = { f: w.fr, r: w.ru, rec: w }
      if (g) {
        g.rows.push(row)
        if (w.addedAt > g.newest) g.newest = w.addedAt
      } else {
        byTheme.set(key, { newest: w.addedAt, rows: [row] })
      }
    }
    return [...byTheme.entries()]
      .map(([key, g]) => ({
        key,
        title: (key && getRule(key)?.titleRu) || NO_THEME,
        newest: g.newest,
        rows: g.rows.sort(
          (a, b) =>
            Number(a.rec ? isLearned(a.rec) : false) -
              Number(b.rec ? isLearned(b.rec) : false) || a.f.localeCompare(b.f),
        ),
      }))
      .sort((a, b) =>
        a.key && b.key ? b.newest.localeCompare(a.newest) : a.key ? -1 : 1,
      )
      .map(({ key, title, rows }) => ({ key, title, rows }))
  }, [userWords, filter, q])

  // «По темам»: ядро A1–B1, группировка по theme в порядке файла (A1→A2→B1).
  const themeGroups = useMemo<Group[]>(() => {
    if (!themed) return []
    const order: string[] = []
    const byTheme = new Map<string, Group>()
    for (const e of themed) {
      let g = byTheme.get(e.theme)
      if (!g) {
        g = { key: e.theme, title: e.theme, level: e.level, rows: [] }
        byTheme.set(e.theme, g)
        order.push(e.theme)
      }
      g.rows.push({ f: e.f, r: e.r, level: e.level, rec: recByFr.get(normFr(e.f)) })
    }
    return order.map((t) => byTheme.get(t)!)
  }, [themed, recByFr])

  // «Поиск»: сначала ядро, потом WikDict, без дублей по normFr.
  const searchRows = useMemo<Row[]>(() => {
    if (!q) return []
    const seen = new Set<string>()
    const out: Row[] = []
    const push = (f: string, r: string, level?: string) => {
      const n = normFr(f)
      if (seen.has(n)) return
      seen.add(n)
      out.push({ f, r, level, rec: recByFr.get(n) })
    }
    const nq = normFr(q)
    const lq = q.toLowerCase()
    for (const e of themed ?? []) {
      if (normFr(e.f).includes(nq) || e.r.toLowerCase().includes(lq))
        push(e.f, e.r, e.level)
    }
    if (wik) for (const e of searchDictionary(wik, q, 400)) push(e.f, e.r)
    return out.slice(0, 400)
  }, [q, themed, wik, recByFr])

  type RenderItem =
    | { kind: 'head'; key: string; title: string; level?: string }
    | { kind: 'row'; row: Row }

  const items = useMemo<RenderItem[]>(() => {
    const out: RenderItem[] = []
    const emitGroups = (groups: Group[]) => {
      for (const g of groups) {
        if (!g.rows.length) continue
        out.push({ kind: 'head', key: `h-${g.key}`, title: g.title, level: g.level })
        for (const r of g.rows) out.push({ kind: 'row', row: r })
      }
    }
    if (mode === 'search') {
      if (q) {
        emitGroups(mineGroups)
        if (searchRows.length) {
          if (mineGroups.some((g) => g.rows.length))
            out.push({ kind: 'head', key: 'h-found', title: 'Найдено в словаре' })
          for (const r of searchRows) out.push({ kind: 'row', row: r })
        }
      }
      return out
    }
    // mode === 'themes'
    emitGroups(mineGroups)
    emitGroups(themeGroups)
    return out
  }, [mode, q, mineGroups, themeGroups, searchRows])

  const shown = items.slice(0, visible)

  return (
    <main className="screen">
      <header>
        <h1 className="app-title">Словарь</h1>
        <p className="muted">
          {status === 'ready'
            ? `ядро A1–B1 · встречено ${counts.total} · пройдено ${counts.learned}`
            : 'Французско-русский словарь'}
        </p>
      </header>

      <div className="chips dict-modes">
        <button
          type="button"
          className={`token${mode === 'themes' ? ' token--picked' : ''}`}
          onClick={() => setMode('themes')}
        >
          По темам
        </button>
        <button
          type="button"
          className={`token${mode === 'search' ? ' token--picked' : ''}`}
          onClick={() => setMode('search')}
        >
          Поиск
        </button>
      </div>

      {mode === 'search' && (
        <div className="search-field">
          <SearchIcon />
          <input
            type="search"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти французское или русское слово…"
          />
        </div>
      )}

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

      {mode === 'search' && q && wikStatus === 'loading' && (
        <p className="muted section-hint">
          <span className="spinner" /> Ищу в большом словаре…
        </p>
      )}
      {mode === 'search' && q && wikStatus === 'error' && (
        <p className="muted section-hint">
          Большой словарь недоступен — показаны совпадения из ядра.
        </p>
      )}

      {status === 'ready' && mode === 'search' && q && items.length === 0 && (
        <p className="muted section-hint">Ничего не нашлось</p>
      )}
      {status === 'ready' && mode === 'search' && !q && (
        <p className="muted section-hint">
          Введите слово — ищем в ядре и в большом словаре WikDict.
        </p>
      )}

      {shown.length > 0 && (
        <ul className="dict-list">
          {shown.map((it) =>
            it.kind === 'head' ? (
              <li key={it.key} className="dict-group-head">
                {it.title}
                {it.level && <span className="dict-level">{it.level}</span>}
              </li>
            ) : (
              <DictRow
                key={`r-${it.row.f}-${it.row.r}`}
                row={it.row}
                onToggle={onToggle}
              />
            ),
          )}
        </ul>
      )}

      {items.length > visible && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setVisible((v) => v + PAGE * 4)}
        >
          Показать ещё
        </button>
      )}

      <p className="dict-attribution muted">
        Ядро A1–B1 — курированный список. Поиск также использует WikDict
        (CC BY-SA 3.0, на основе Wiktionary).
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
        {row.rec?.exampleFr && row.rec.exampleRu && (
          <span className="dict-example">
            <span className="serif">{row.rec.exampleFr}</span>
            <span className="muted"> — {row.rec.exampleRu}</span>
          </span>
        )}
      </button>
    </li>
  )
}
