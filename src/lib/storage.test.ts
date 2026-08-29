import { beforeEach, describe, expect, it } from 'vitest'
import {
  mergeServerProgress,
  recordLightSession,
  recordSessionCompletion,
  weakRules,
} from './storage'
import { sessionsForUnit } from './syllabus'
import type { RuleRecord } from './types'

// В node-окружении localStorage нет — ставим свежий in-memory шим перед каждым
// тестом, чтобы можно было проверять накопление (несколько записей подряд).
beforeEach(() => {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage
})

const ru = (id: string): RuleRecord['ruleId'] => id
const sessionRef = (ruleId: string) => ({
  ruleId,
  unitId: 'a1-u1',
  level: 'A1' as const,
  ruleTitleFr: 'T',
})

describe('recordSessionCompletion', () => {
  it('одно правило из пяти: пишет rules, но не кэш units', () => {
    const p = recordSessionCompletion(
      sessionRef('a1-u1-verbes-etre-avoir'),
      82,
      [
        { fr: 'la boxe', ru: 'бокс' },
        { fr: 'le ski', ru: 'лыжи' },
      ],
    )
    expect(p.rules['a1-u1-verbes-etre-avoir'].bestAccuracy).toBe(82)
    expect(p.rules['a1-u1-verbes-etre-avoir'].attempts).toBe(1)
    expect(p.units['a1-u1']).toBeUndefined()
    expect(p.words.map((w) => w.fr).sort()).toEqual(['la boxe', 'le ski'])
    expect(p.streakDays).toBe(1)
  })

  it('все правила юнита пройдены → появляется кэш units со средним баллом', () => {
    const rules = sessionsForUnit('a1-u1').map((s) => s.ruleId)
    let p = recordSessionCompletion(sessionRef(rules[0]), 80)
    for (const id of rules.slice(1)) {
      p = recordSessionCompletion(sessionRef(id), 90)
    }
    expect(Object.keys(p.rules)).toHaveLength(5)
    expect(p.units['a1-u1']).toBeDefined()
    expect(p.units['a1-u1'].bestAccuracy).toBe(Math.round((80 + 90 * 4) / 5))
  })

  it('лучший балл — максимум по попыткам', () => {
    recordSessionCompletion(sessionRef(ru('a1-u1-verbes-etre-avoir')), 90)
    const p = recordSessionCompletion(
      sessionRef(ru('a1-u1-verbes-etre-avoir')),
      55,
    )
    expect(p.rules['a1-u1-verbes-etre-avoir'].bestAccuracy).toBe(90)
    expect(p.rules['a1-u1-verbes-etre-avoir'].attempts).toBe(2)
  })

  it('повторение (session=null) не трогает rules/units, но пишет слова и стрик', () => {
    const p = recordSessionCompletion(null, 90, [{ fr: 'un mot', ru: 'слово' }])
    expect(p.rules).toEqual({})
    expect(p.units).toEqual({})
    expect(p.words[0].fr).toBe('un mot')
    expect(p.streakDays).toBe(1)
  })
})

describe('recordLightSession', () => {
  it('поднимает стрик, не создавая rules/units', () => {
    const p = recordLightSession()
    expect(p.streakDays).toBe(1)
    expect(p.rules).toEqual({})
    expect(p.units).toEqual({})
  })

  it('лёгкий режим + практика в тот же день не накручивают стрик дважды', () => {
    recordLightSession()
    const p = recordSessionCompletion(
      sessionRef('a1-u1-verbes-etre-avoir'),
      80,
    )
    expect(p.streakDays).toBe(1)
  })
})

describe('mergeServerProgress', () => {
  it('принимает новый формат { units, rules, words }', () => {
    const rrec: RuleRecord = {
      ruleId: 'a2-u1-passe-compose',
      unitId: 'a2-u1',
      level: 'A2',
      titleFr: 'T',
      bestAccuracy: 65,
      attempts: 2,
      lastCompletedAt: '2026-01-01T00:00:00.000Z',
    }
    const merged = mergeServerProgress(
      {
        units: {},
        rules: { 'a2-u1-passe-compose': rrec },
        words: [{ fr: 'x', ru: 'икс', addedAt: '2026-01-01T00:00:00.000Z' }],
      },
      3,
      65,
    )
    expect(merged.rules['a2-u1-passe-compose'].bestAccuracy).toBe(65)
    expect(merged.words).toHaveLength(1)
    expect(merged.streakDays).toBe(3)
    expect(weakRules(merged).map((r) => r.ruleId)).toEqual([
      'a2-u1-passe-compose',
    ])
  })

  it('прежний формат { units, words } — сидирует rules и пересобирает units', () => {
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
    // каждое правило a2-u1 засеяно
    for (const s of sessionsForUnit('a2-u1')) {
      expect(merged.rules[s.ruleId].bestAccuracy).toBe(65)
    }
    // юнит пересобран в кэш
    expect(merged.units['a2-u1']).toBeDefined()
  })

  it('легаси-формат (плоская карта UnitRecord)', () => {
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
    for (const s of sessionsForUnit('a1-u1')) {
      expect(merged.rules[s.ruleId].bestAccuracy).toBe(90)
    }
    expect(merged.words).toEqual([])
  })
})
