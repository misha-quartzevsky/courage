import { beforeEach, describe, expect, it } from 'vitest'
import {
  dueWordCount,
  dueWords,
  isLearned,
  loadProgress,
  mergeServerProgress,
  recordLightSession,
  interleaveRules,
  recordSessionCompletion,
  SRS_STEPS,
  toggleWordLearned,
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

describe('словарь: mastery / «пройдено»', () => {
  it('верные ответы в повторении поднимают mastery, не сбрасывая слово', () => {
    recordSessionCompletion(null, 90, [{ fr: 'la boxe', ru: 'бокс' }])
    let p = recordSessionCompletion(null, 90, [], ['la boxe'])
    const w1 = p.words.find((w) => w.fr === 'la boxe')!
    expect(w1.mastery).toBe(1)
    expect(w1.lastSeenAt).toBeTruthy()
    expect(isLearned(w1)).toBe(false)

    p = recordSessionCompletion(null, 90, [], ['la boxe'])
    const w2 = p.words.find((w) => w.fr === 'la boxe')!
    expect(w2.mastery).toBe(2)
    expect(isLearned(w2)).toBe(true)

    // Повторное появление того же слова как «нового» не сбрасывает mastery.
    p = recordSessionCompletion(null, 90, [{ fr: 'la boxe', ru: 'бокс' }])
    expect(p.words.find((w) => w.fr === 'la boxe')!.mastery).toBe(2)
  })

  it('toggleWordLearned переключает 0 ⇄ 2 у существующего слова', () => {
    recordSessionCompletion(null, 90, [{ fr: 'nager', ru: 'плавать' }])
    let p = toggleWordLearned('nager')
    expect(p.words.find((w) => w.fr === 'nager')!.mastery).toBe(2)
    p = toggleWordLearned('nager')
    expect(p.words.find((w) => w.fr === 'nager')!.mastery).toBe(0)
  })

  it('toggleWordLearned добавляет отсутствующее слово сразу как «пройдено»', () => {
    const p = toggleWordLearned('ordinateur', 'компьютер')
    const w = p.words.find((x) => x.fr === 'ordinateur')!
    expect(w.ru).toBe('компьютер')
    expect(isLearned(w)).toBe(true)
  })

  it('старый прогресс без mastery грузится', () => {
    localStorage.setItem(
      'courage:progress',
      JSON.stringify({
        rules: {},
        units: {},
        words: [{ fr: 'vieux', ru: 'старый', addedAt: '2026-01-01T00:00:00.000Z' }],
        streakDays: 1,
        bestAccuracy: 0,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    )
    const p = loadProgress()!
    expect(p.words[0].fr).toBe('vieux')
    expect(p.words[0].mastery).toBeUndefined()
    expect(isLearned(p.words[0])).toBe(false)
  })
})

describe('SRS: интервальные повторения слов', () => {
  const dayMs = 86_400_000

  it('новое слово урока входит в очередь с dueAt = завтра', () => {
    const p = recordSessionCompletion(null, 90, [{ fr: 'le pont', ru: 'мост' }])
    const w = p.words.find((x) => x.fr === 'le pont')!
    expect(w.interval).toBe(0)
    expect(Date.parse(w.dueAt!) - Date.parse(w.addedAt)).toBeGreaterThan(dayMs - 1000)
  })

  it('верный ответ двигает interval по шкале, ошибка сбрасывает к первому шагу', () => {
    recordSessionCompletion(null, 90, [{ fr: 'la clé', ru: 'ключ' }])
    let p = recordSessionCompletion(null, 90, [], ['la clé'])
    expect(p.words.find((w) => w.fr === 'la clé')!.interval).toBe(SRS_STEPS[0])
    p = recordSessionCompletion(null, 90, [], ['la clé'])
    expect(p.words.find((w) => w.fr === 'la clé')!.interval).toBe(SRS_STEPS[1])

    p = recordSessionCompletion(null, 40, [], [], ['la clé'])
    const w = p.words.find((x) => x.fr === 'la clé')!
    expect(w.interval).toBe(SRS_STEPS[0])
    expect(Date.parse(w.dueAt!) - Date.parse(w.lastSeenAt!)).toBeLessThan(2 * dayMs)
  })

  it('слово «пройдено», когда доросло по SRS до месячного интервала', () => {
    recordSessionCompletion(null, 90, [{ fr: 'le mur', ru: 'стена' }])
    let p = loadProgress()!
    for (let i = 0; i < SRS_STEPS.length; i++) {
      p = recordSessionCompletion(null, 90, [], ['le mur'])
    }
    const w = p.words.find((x) => x.fr === 'le mur')!
    expect(w.interval).toBe(SRS_STEPS[SRS_STEPS.length - 1])
    expect(isLearned(w)).toBe(true)
  })

  it('dueWords тянет просроченное по сроку, «пройдённое» вручную не трогает', () => {
    const d = (n: number) => new Date(Date.now() + n * dayMs).toISOString()
    localStorage.setItem(
      'courage:progress',
      JSON.stringify({
        rules: {},
        units: {},
        words: [
          { fr: 'overdue', ru: 'a', addedAt: d(-20), interval: 3, dueAt: d(-10) },
          { fr: 'legacy', ru: 'b', addedAt: d(-5) },
          { fr: 'fresh', ru: 'c', addedAt: d(-20), interval: 7, dueAt: d(10) },
          { fr: 'known', ru: 'd', addedAt: d(-20), mastery: 2 },
        ],
        streakDays: 1,
        bestAccuracy: 0,
        updatedAt: d(-5),
      }),
    )
    const p = loadProgress()
    const due = dueWords(p, new Date(), 2).map((w) => w.fr)
    expect(due).toContain('overdue')
    expect(due).toContain('legacy')
    expect(due).not.toContain('known')
    expect(due[0]).toBe('overdue') // самое просроченное — первым
    expect(dueWordCount(p)).toBe(2)
  })

  it('слова урока получают ruleId правила-фокуса; повторение — без темы', () => {
    const p = recordSessionCompletion(
      sessionRef('a1-u1-verbes-etre-avoir'),
      80,
      [{ fr: 'être', ru: 'быть' }],
    )
    expect(p.words.find((w) => w.fr === 'être')!.ruleId).toBe(
      'a1-u1-verbes-etre-avoir',
    )
    const p2 = recordSessionCompletion(null, 80, [{ fr: 'salut', ru: 'привет' }])
    expect(p2.words.find((w) => w.fr === 'salut')!.ruleId).toBeUndefined()
  })

  it('dueWords держит слова одной темы подряд, блок — по срочности', () => {
    const d = (n: number) => new Date(Date.now() + n * dayMs).toISOString()
    localStorage.setItem(
      'courage:progress',
      JSON.stringify({
        rules: {},
        units: {},
        words: [
          { fr: 'a1', ru: '1', addedAt: d(-9), dueAt: d(-9), ruleId: 'R-A' },
          { fr: 'b1', ru: '1', addedAt: d(-8), dueAt: d(-8), ruleId: 'R-B' },
          { fr: 'a2', ru: '2', addedAt: d(-7), dueAt: d(-7), ruleId: 'R-A' },
          { fr: 'b2', ru: '2', addedAt: d(-6), dueAt: d(-6), ruleId: 'R-B' },
        ],
        streakDays: 1,
        bestAccuracy: 0,
        updatedAt: d(-6),
      }),
    )
    const order = dueWords(loadProgress(), new Date(), 2).map((w) => w.fr)
    // R-A самое просроченное (a1 @ -9) → весь блок R-A, затем весь блок R-B
    expect(order).toEqual(['a1', 'a2', 'b1', 'b2'])
  })
})

describe('interleaveRules', () => {
  it('приоритет — слабые правила (bestAccuracy < 70), самые слабые первыми', () => {
    const rules = sessionsForUnit('a1-u1').map((s) => s.ruleId)
    recordSessionCompletion(sessionRef(rules[0]), 40)
    recordSessionCompletion(sessionRef(rules[1]), 55)
    recordSessionCompletion(sessionRef(rules[2]), 90)
    const p = recordSessionCompletion(sessionRef(rules[3]), 95)
    const picked = interleaveRules(p, rules[4]).map((r) => r.ruleId)
    expect(picked).toEqual([rules[0], rules[1]])
  })

  it('исключает текущее правило, добирает крепкими по давности если слабых мало', () => {
    const rules = sessionsForUnit('a1-u1').map((s) => s.ruleId)
    recordSessionCompletion(sessionRef(rules[0]), 40) // одно слабое
    recordSessionCompletion(sessionRef(rules[1]), 90)
    const p = recordSessionCompletion(sessionRef(rules[2]), 95)
    const picked = interleaveRules(p, rules[0], 2).map((r) => r.ruleId)
    expect(picked).not.toContain(rules[0]) // исключено
    expect(picked).toHaveLength(2)
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
