// Прогресс ученика: история по юнитам, выученные слова, стрик, лучший балл.
// LocalStorage — источник для демо-режима и оффлайн-кэш; при наличии Supabase
// дублируется в profiles.progress (jsonb): { units, words }.

import type {
  LearnedWord,
  ProgressState,
  SprintSession,
  UnitRecord,
  WordRecord,
} from './types'
import { unitById } from './syllabus'
import { updateProgress } from './supabase'

const KEY = 'courage:progress'
const WORDS_CAP = 120

const EMPTY: ProgressState = {
  units: {},
  words: [],
  streakDays: 0,
  bestAccuracy: 0,
  updatedAt: new Date(0).toISOString(),
}

interface LegacyProgress {
  completedUnitIds?: unknown
  streakDays?: unknown
  bestAccuracy?: unknown
  updatedAt?: unknown
}

function asUnits(v: unknown): Record<string, UnitRecord> {
  return v && typeof v === 'object' ? (v as Record<string, UnitRecord>) : {}
}

function asWords(v: unknown): WordRecord[] {
  if (!Array.isArray(v)) return []
  return v.filter(
    (w): w is WordRecord =>
      !!w &&
      typeof w === 'object' &&
      typeof (w as WordRecord).fr === 'string' &&
      typeof (w as WordRecord).ru === 'string',
  )
}

// Слить два списка слов: дедуп по fr (новее addedAt), кап, сортировка по свежести.
function mergeWords(a: WordRecord[], b: WordRecord[]): WordRecord[] {
  const by = new Map<string, WordRecord>()
  for (const w of [...a, ...b]) {
    const key = w.fr.trim().toLowerCase()
    const cur = by.get(key)
    if (!cur || w.addedAt > cur.addedAt) by.set(key, w)
  }
  return [...by.values()]
    .sort((x, y) => (x.addedAt < y.addedAt ? 1 : -1))
    .slice(0, WORDS_CAP)
}

function migrate(raw: unknown): ProgressState | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>

  const streakDays = typeof p.streakDays === 'number' ? p.streakDays : 0
  const bestAccuracy = typeof p.bestAccuracy === 'number' ? p.bestAccuracy : 0
  const updatedAt =
    typeof p.updatedAt === 'string' ? p.updatedAt : new Date().toISOString()

  // Текущий формат.
  if (p.units && typeof p.units === 'object') {
    return {
      units: asUnits(p.units),
      words: asWords(p.words),
      streakDays,
      bestAccuracy,
      updatedAt,
    }
  }

  // Легаси: плоский список id.
  const legacy = raw as LegacyProgress
  if (Array.isArray(legacy.completedUnitIds)) {
    const units: Record<string, UnitRecord> = {}
    for (const id of legacy.completedUnitIds) {
      if (typeof id !== 'string') continue
      const u = unitById(id)
      units[id] = {
        unitId: id,
        level: u?.level ?? 'A1',
        titleFr: u?.titleFr ?? id,
        bestAccuracy: 0,
        attempts: 1,
        lastCompletedAt: updatedAt,
      }
    }
    return { units, words: [], streakDays, bestAccuracy, updatedAt }
  }

  return null
}

export function loadProgress(): ProgressState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return migrate(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveProgress(progress: ProgressState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress))
  } catch {
    // Приватный режим Safari бросает QuotaExceeded — молча роняем.
  }
}

function nextStreak(prev: ProgressState | null, now: Date): number {
  if (!prev || prev.updatedAt === EMPTY.updatedAt) return 1
  const dayKey = (d: Date) => d.toISOString().slice(0, 10)
  const todayKey = dayKey(now)
  const prevKey = prev.updatedAt.slice(0, 10)
  if (prevKey === todayKey) return prev.streakDays
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  return prevKey === dayKey(yesterday) ? prev.streakDays + 1 : 1
}

// Записать прохождение спринта: история юнита (если не повторение), слова, стрик.
export function recordCompletion(
  sprint: SprintSession,
  avgAccuracy: number,
  learnedWords: LearnedWord[] = [],
): ProgressState {
  const prev = loadProgress()
  const now = new Date()
  const nowIso = now.toISOString()

  const words = mergeWords(
    prev?.words ?? [],
    learnedWords.map((w) => ({ fr: w.fr, ru: w.ru, addedAt: nowIso })),
  )

  let units = prev?.units ?? {}
  if (!sprint.revision) {
    const prevUnit = units[sprint.unitId]
    units = {
      ...units,
      [sprint.unitId]: {
        unitId: sprint.unitId,
        level: sprint.level,
        titleFr: sprint.unitTitleFr,
        bestAccuracy: Math.max(prevUnit?.bestAccuracy ?? 0, avgAccuracy),
        attempts: (prevUnit?.attempts ?? 0) + 1,
        lastCompletedAt: nowIso,
      },
    }
  }

  const next: ProgressState = {
    units,
    words,
    streakDays: nextStreak(prev, now),
    bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, avgAccuracy),
    updatedAt: nowIso,
  }
  saveProgress(next)

  void updateProgress({
    streakDays: next.streakDays,
    bestAccuracy: next.bestAccuracy,
    lastCompletedAt: next.updatedAt,
    units: next.units,
    words: next.words,
  })

  return next
}

// Мерж прогресса с сервера в локальный. serverProgress — { units, words } или
// легаси-карта UnitRecord.
export function mergeServerProgress(
  serverProgress: unknown,
  serverStreak: number,
  serverBest: number,
): ProgressState {
  const local = loadProgress() ?? EMPTY

  const raw = (serverProgress ?? {}) as Record<string, unknown>
  const serverUnits =
    raw.units && typeof raw.units === 'object'
      ? asUnits(raw.units)
      : asUnits(serverProgress)
  const serverWords = asWords(raw.words)

  const units: Record<string, UnitRecord> = { ...local.units }
  for (const [id, srv] of Object.entries(serverUnits)) {
    const loc = units[id]
    if (!loc || srv.lastCompletedAt > loc.lastCompletedAt) {
      units[id] = srv
    } else {
      units[id] = {
        ...srv,
        ...loc,
        bestAccuracy: Math.max(srv.bestAccuracy, loc.bestAccuracy),
      }
    }
  }

  const merged: ProgressState = {
    units,
    words: mergeWords(local.words, serverWords),
    streakDays: Math.max(local.streakDays, serverStreak),
    bestAccuracy: Math.max(local.bestAccuracy, serverBest),
    updatedAt: new Date().toISOString(),
  }
  saveProgress(merged)
  return merged
}

// Множество пройденных unitId — для карты курса и nextUnit().
export function doneUnitIds(progress: ProgressState | null): Set<string> {
  return new Set(Object.keys(progress?.units ?? {}))
}

// Пройденные, но слабые юниты (для Révision).
export function weakUnits(progress: ProgressState | null): UnitRecord[] {
  return Object.values(progress?.units ?? {})
    .filter((u) => u.bestAccuracy < 70)
    .sort((a, b) => a.bestAccuracy - b.bestAccuracy)
}
