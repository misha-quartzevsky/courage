import { beforeEach, describe, expect, it } from 'vitest'
import {
  addSeenWord,
  consolidatedRuleIds,
  dueRules,
  recordDrillComplete,
  INTERLEAVE_MIN_AGE_DAYS,
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

describe('interleaveRules: сначала блоками, потом интерлив', () => {
  const iso = (daysAgo: number) =>
    new Date(Date.now() - daysAgo * 86400000).toISOString()
  const rec = (id: string, over: Partial<RuleRecord> = {}): RuleRecord => ({
    ruleId: id, unitId: 'a1-u1', level: 'A1', titleFr: id,
    bestAccuracy: 80, attempts: 3, lastCompletedAt: iso(10), ...over,
  })
  const put = (rules: Record<string, RuleRecord>) =>
    localStorage.setItem('courage:progress', JSON.stringify({
      rules, units: {}, words: [], streakDays: 1, bestAccuracy: 80, updatedAt: iso(0),
    }))

  it('не интерливит недавнее (< порога) и малопройденное (< 2 попыток)', () => {
    put({
      recent: rec('recent', { lastCompletedAt: iso(0) }),
      few: rec('few', { attempts: 1 }),
      ok: rec('ok', { lastCompletedAt: iso(INTERLEAVE_MIN_AGE_DAYS + 3) }),
    })
    expect(interleaveRules(loadProgress(), 'focus', 3).map((r) => r.ruleId)).toEqual(['ok'])
  })

  it('слабые правила (bestAccuracy < 70) — первыми', () => {
    put({
      weak: rec('weak', { bestAccuracy: 50, lastCompletedAt: iso(5) }),
      strong: rec('strong', { bestAccuracy: 95, lastCompletedAt: iso(5) }),
      mid: rec('mid', { bestAccuracy: 60, lastCompletedAt: iso(5) }),
    })
    const ids = interleaveRules(loadProgress(), 'focus', 2).map((r) => r.ruleId)
    expect(ids).toEqual(['weak', 'mid'])
  })

  it('исключает текущее правило, добирает крепкими по давности', () => {
    put({
      focus: rec('focus'),
      weak: rec('weak', { bestAccuracy: 40, lastCompletedAt: iso(5) }),
      oldStrong: rec('oldStrong', { bestAccuracy: 90, lastCompletedAt: iso(30) }),
      newStrong: rec('newStrong', { bestAccuracy: 90, lastCompletedAt: iso(5) }),
    })
    const ids = interleaveRules(loadProgress(), 'focus', 2).map((r) => r.ruleId)
    expect(ids).not.toContain('focus')
    expect(ids).toEqual(['weak', 'oldStrong'])
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

describe('addSeenWord (тап по слову в ридере)', () => {
  it('добавляет новое слово в SRS: mastery 0, dueAt ≈ завтра, sourceRef', () => {
    const p = addSeenWord('le marché', 'рынок', 'text:marche-dimanche')
    const w = p.words.find((x) => x.fr === 'le marché')!
    expect(w.mastery).toBe(0)
    expect(w.interval).toBe(0)
    expect(w.sourceRef).toBe('text:marche-dimanche')
    expect(Date.parse(w.dueAt!)).toBeGreaterThan(Date.now())
  })

  it('не трогает стрик / updatedAt', () => {
    const before = recordLightSession()
    const after = addSeenWord('une pomme', 'яблоко', 'text:x')
    expect(after.streakDays).toBe(before.streakDays)
    expect(after.updatedAt).toBe(before.updatedAt)
  })

  it('повторный тап по тому же слову не регрессирует выученное', () => {
    let p = addSeenWord('le pain', 'хлеб', 'text:x')
    p = toggleWordLearned('le pain', 'хлеб')
    expect(isLearned(p.words.find((w) => w.fr === 'le pain')!)).toBe(true)
    p = addSeenWord('le pain', 'хлеб', 'text:y')
    expect(isLearned(p.words.find((w) => w.fr === 'le pain')!)).toBe(true)
  })

  it('sourceRef переживает merge с сервером', () => {
    addSeenWord('le chat', 'кот', 'text:chat-voisine')
    const merged = mergeServerProgress(undefined, 0, 0)
    expect(merged.words.find((w) => w.fr === 'le chat')?.sourceRef).toBe(
      'text:chat-voisine',
    )
  })
})

describe('дрилл-тренажёр правил (A1)', () => {
  const RID = 'a1-u1-verbes-etre-avoir'

  it('без «Выучила»: копит drillRounds, держит стрик, НЕ консолидирует', () => {
    const p = recordDrillComplete(RID, { rounds: 2, selfLearned: false, cleanRound: false })
    expect(p.rules[RID].drillRounds).toBe(2)
    expect(p.rules[RID].learnedAt).toBeUndefined()
    expect(p.streakDays).toBe(1)
    expect(consolidatedRuleIds(p).has(RID)).toBe(false)
  })

  it('накопление кругов между заходами', () => {
    recordDrillComplete(RID, { rounds: 1, selfLearned: false, cleanRound: false })
    const p = recordDrillComplete(RID, { rounds: 3, selfLearned: false, cleanRound: false })
    expect(p.rules[RID].drillRounds).toBe(4)
  })

  it('«Выучила» ставит learnedAt + dueAt (+7д) и консолидирует', () => {
    const p = recordDrillComplete(RID, { rounds: 1, selfLearned: true, cleanRound: true })
    const r = p.rules[RID]
    expect(r.learnedAt).toBeTruthy()
    expect(Date.parse(r.dueAt!) - Date.parse(r.learnedAt!)).toBeGreaterThan(6 * 86400000)
    expect(consolidatedRuleIds(p).has(RID)).toBe(true)
  })

  it('legacy-правило (запись без drillRounds) считается консолидированным', () => {
    const before = recordSessionCompletion(sessionRef('a1-u1-articles-definis'), 70)
    expect(before.rules['a1-u1-articles-definis'].drillRounds).toBeUndefined()
    expect(consolidatedRuleIds(before).has('a1-u1-articles-definis')).toBe(true)
  })

  it('dueRules возвращает выученное с просроченным dueAt', () => {
    localStorage.setItem('courage:progress', JSON.stringify({
      rules: {
        overdue: { ruleId: 'overdue', unitId: 'a1-u1', level: 'A1', titleFr: 'x', bestAccuracy: 100, attempts: 1, lastCompletedAt: '2026-01-01T00:00:00.000Z', drillRounds: 3, learnedAt: '2026-01-01T00:00:00.000Z', dueAt: '2026-01-05T00:00:00.000Z' },
        fresh: { ruleId: 'fresh', unitId: 'a1-u1', level: 'A1', titleFr: 'y', bestAccuracy: 100, attempts: 1, lastCompletedAt: '2026-01-01T00:00:00.000Z', drillRounds: 3, learnedAt: '2026-01-01T00:00:00.000Z', dueAt: '2099-01-01T00:00:00.000Z' },
      },
      units: {}, words: [], streakDays: 1, bestAccuracy: 100, updatedAt: '2026-01-01T00:00:00.000Z',
    }))
    const due = dueRules(loadProgress(), new Date('2026-02-01T00:00:00.000Z')).map((r) => r.ruleId)
    expect(due).toEqual(['overdue'])
  })
});

