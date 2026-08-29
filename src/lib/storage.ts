// Микро-прогресс для 3-дневного спринта: что пройдено, стрик, лучший балл.
// Пока это единственное, что мы сохраняем на устройстве (LocalStorage).

import type { ProgressState } from './types'
import { updateProgress } from './supabase'

const KEY = 'courage:progress'

export function loadProgress(): ProgressState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ProgressState>
    if (
      !Array.isArray(parsed.completedUnitIds) ||
      typeof parsed.streakDays !== 'number' ||
      typeof parsed.bestAccuracy !== 'number'
    ) {
      return null
    }
    return {
      completedUnitIds: parsed.completedUnitIds,
      streakDays: parsed.streakDays,
      bestAccuracy: parsed.bestAccuracy,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function saveProgress(progress: ProgressState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress))
  } catch {
    // TODO(debt): приватный режим Safari бросает QuotaExceeded — молча
    // роняем; прогресс в этом случае не сохранится до следующей сессии.
  }
}

// Записать прохождение юнита: обновить список, стрик и лучший балл.
export function recordCompletion(
  unitId: string,
  accuracy: number,
): ProgressState {
  const prev = loadProgress()
  const now = new Date()
  const todayKey = now.toISOString().slice(0, 10)

  let streakDays = 1
  if (prev) {
    const prevKey = prev.updatedAt.slice(0, 10)
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const yKey = yesterday.toISOString().slice(0, 10)
    streakDays =
      prevKey === todayKey
        ? prev.streakDays
        : prevKey === yKey
          ? prev.streakDays + 1
          : 1
  }

  const completedUnitIds = prev
    ? Array.from(new Set([...prev.completedUnitIds, unitId]))
    : [unitId]

  const next: ProgressState = {
    completedUnitIds,
    streakDays,
    bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, accuracy),
    updatedAt: now.toISOString(),
  }
  saveProgress(next)

  // Оффлайн-кэш сохранён. Параллельно синхронизируем стрик/балл в Supabase
  // (ошибки глушатся внутри updateProgress — оффлайн не должен ломать спринт).
  void updateProgress({
    streakDays: next.streakDays,
    bestAccuracy: next.bestAccuracy,
    lastCompletedAt: next.updatedAt,
  })

  return next
}