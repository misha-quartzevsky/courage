import { describe, expect, it } from 'vitest'
import { mergeServerProgress, recordCompletion, weakUnits } from './storage'
import type { SprintSession } from './types'

// В node-окружении localStorage недоступен — loadProgress/saveProgress
// молча no-op'ят, поэтому prev всегда null. Проверяем чистую логику.

const unitSprint = (id: string, level: 'A1' | 'A2' = 'A1'): SprintSession => ({
  id: 's',
  unitId: id,
  unitTitleFr: 'T',
  level,
  durationMinutes: 5,
  situation: { titleFr: 'x', contextFr: 'y' },
  exercises: [],
  createdAt: new Date().toISOString(),
})

describe('recordCompletion', () => {
  it('юнит-спринт пишет историю юнита и слова', () => {
    const p = recordCompletion(unitSprint('a1-u1'), 82, [
      { fr: 'la boxe', ru: 'бокс' },
      { fr: 'le ski', ru: 'лыжи' },
    ])
    expect(p.units['a1-u1'].bestAccuracy).toBe(82)
    expect(p.units['a1-u1'].attempts).toBe(1)
    expect(p.words.map((w) => w.fr).sort()).toEqual(['la boxe', 'le ski'])
    expect(p.streakDays).toBe(1)
  })

  it('revision-спринт не трогает units, но пишет слова и стрик', () => {
    const p = recordCompletion(
      { ...unitSprint('revision'), revision: true },
      90,
      [{ fr: 'un mot', ru: 'слово' }],
    )
    expect(p.units).toEqual({})
    expect(p.words[0].fr).toBe('un mot')
    expect(p.streakDays).toBe(1)
  })
})

describe('mergeServerProgress', () => {
  it('принимает новый формат { units, words }', () => {
    const merged = mergeServerProgress(
      {
        units: {
          'a2-u1': {
            unitId: 'a2-u1',
            level: 'A2',
            titleFr: 'T',
            bestAccuracy: 65,
            attempts: 2,
            lastCompletedAt: '2026-01-01T00:00:00.000Z',
          },
        },
        words: [{ fr: 'x', ru: 'икс', addedAt: '2026-01-01T00:00:00.000Z' }],
      },
      3,
      65,
    )
    expect(merged.units['a2-u1'].bestAccuracy).toBe(65)
    expect(merged.words).toHaveLength(1)
    expect(merged.streakDays).toBe(3)
    expect(weakUnits(merged).map((u) => u.unitId)).toEqual(['a2-u1'])
  })

  it('принимает легаси-формат (плоская карта UnitRecord)', () => {
    const merged = mergeServerProgress(
      {
        'a1-u1': {
          unitId: 'a1-u1',
          level: 'A1',
          titleFr: 'T',
          bestAccuracy: 90,
          attempts: 1,
          lastCompletedAt: '2026-01-01T00:00:00.000Z',
        },
      },
      1,
      90,
    )
    expect(merged.units['a1-u1'].bestAccuracy).toBe(90)
    expect(merged.words).toEqual([])
  })
})
