// Прогресс ученика: история по юнитам, стрик, лучший балл.
// LocalStorage — источник для демо-режима и оффлайн-кэш; при наличии Supabase
// дублируется в profiles.progress (jsonb).

import type { ProgressState, SprintSession, UnitRecord } from './types'
import { unitById } from './syllabus'
import { updateProgress } from './supabase'

const KEY = 'courage:progress'

const EMPTY: ProgressState = {
  units: {},
  streakDays: 0,
  bestAccuracy: 0,
  updatedAt: new Date(0).toISOString(),
}

// Старый формат (до карты курса): { completedUnitIds: string[], ... }.
interface LegacyProgress {
  completedUnitIds?: unknown
  streakDays?: unknown
  bestAccuracy?: unknown
  updatedAt?: unknown
}

function migrate(raw: unknown): ProgressState | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>

  const streakDays = typeof p.streakDays === 'number' ? p.streakDays : 0
  const bestAccuracy = typeof p.bestAccuracy === 'number' ? p.bestAccuracy : 0
  const updatedAt =
    typeof p.updatedAt === 'string' ? p.updatedAt : new Date().toISOString()

  // Новый формат.
  if (p.units && typeof p.units === 'object') {
    return {
      units: p.units as Record<string, UnitRecord>,
      streakDays,
      bestAccuracy,
      updatedAt,
    }
  }

  // Легаси: разложить плоский список id в карту юнитов.
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
    return { units, streakDays, bestAccuracy, updatedAt }
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

// Записать прохождение юнита: обновить историю, стрик и лучший балл.
export function recordCompletion(
  sprint: SprintSession,
  avgAccuracy: number,
): ProgressState {
  const prev = loadProgress()
  const now = new Date()
  const nowIso = now.toISOString()

  const prevUnit = prev?.units[sprint.unitId]
  const unitRecord: UnitRecord = {
    unitId: sprint.unitId,
    level: sprint.level,
    titleFr: sprint.unitTitleFr,
    bestAccuracy: Math.max(prevUnit?.bestAccuracy ?? 0, avgAccuracy),
    attempts: (prevUnit?.attempts ?? 0) + 1,
    lastCompletedAt: nowIso,
  }

  const next: ProgressState = {
    units: { ...(prev?.units ?? {}), [sprint.unitId]: unitRecord },
    streakDays: nextStreak(prev, now),
    bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, avgAccuracy),
    updatedAt: nowIso,
  }
  saveProgress(next)

  // Оффлайн-кэш сохранён; параллельно синкаем в Supabase (ошибки глушатся внутри).
  void updateProgress({
    streakDays: next.streakDays,
    bestAccuracy: next.bestAccuracy,
    lastCompletedAt: next.updatedAt,
    units: next.units,
  })

  return next
}

// Мерж истории с сервера в локальную: по каждому юниту побеждает более свежий
// lastCompletedAt. Возвращает объединённое состояние (и кэширует его локально).
export function mergeServerProgress(
  serverUnits: Record<string, UnitRecord> | null | undefined,
  serverStreak: number,
  serverBest: number,
): ProgressState {
  const local = loadProgress() ?? EMPTY
  const units: Record<string, UnitRecord> = { ...local.units }

  for (const [id, srv] of Object.entries(serverUnits ?? {})) {
    const loc = units[id]
    if (!loc || srv.lastCompletedAt > loc.lastCompletedAt) {
      units[id] = srv
    } else {
      units[id] = { ...srv, ...loc, bestAccuracy: Math.max(srv.bestAccuracy, loc.bestAccuracy) }
    }
  }

  const merged: ProgressState = {
    units,
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
