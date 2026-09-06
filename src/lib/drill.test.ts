import { describe, expect, it } from 'vitest'
import {
  DRILL_FORMATS,
  buildRound,
  checkStep,
  parseDrill,
} from './drill'
import type { Drill } from './types'

const fixture: Drill = {
  ruleId: 'test-rule',
  titleRu: 'Тест',
  titleFr: 'Test',
  plainRu: 'коротко',
  text: { fr: 'Je suis là.', ru: 'Я здесь.' },
  forms: [
    {
      label: 'je',
      answerFr: 'suis',
      items: [
        { fr: 'Je {} là.', ru: 'Я здесь.', distractors: ['es', 'est'] },
        { fr: 'Je {} prêt.', ru: 'Я готов.', distractors: ['es', 'sont'] },
      ],
    },
    {
      label: 'tu',
      answerFr: 'es',
      items: [
        { fr: 'Tu {} libre.', ru: 'Ты свободен.', distractors: ['suis', 'est'] },
        { fr: 'Tu {} ici.', ru: 'Ты здесь.', distractors: ['sont', 'suis'] },
      ],
    },
    {
      label: 'il',
      answerFr: 'est',
      items: [
        { fr: 'Il {} grand.', ru: 'Он высокий.', distractors: ['es', 'suis'] },
        { fr: 'Elle {} là.', ru: 'Она здесь.', distractors: ['sont', 'es'] },
      ],
    },
  ],
}

describe('parseDrill', () => {
  it('принимает валидный дрилл', () => {
    expect(parseDrill(fixture)?.forms.length).toBe(3)
  })
  it('бракует битое', () => {
    expect(parseDrill(null)).toBeNull()
    expect(parseDrill({ ...fixture, forms: [fixture.forms[0]] })).toBeNull() // < 2 форм
    expect(parseDrill({ ...fixture, titleRu: 42 })).toBeNull()
    expect(
      parseDrill({ ...fixture, forms: [{ label: 'x' }, { label: 'y' }] }),
    ).toBeNull() // формы без answerFr/items
  })
})

describe('buildRound', () => {
  it('формат ротируется по номеру круга', () => {
    for (let i = 0; i < 12; i++) {
      expect(buildRound(fixture, i)[0].kind).toBe(DRILL_FORMATS[i % 5])
    }
  })

  it('choice/bank: один шаг на форму, ответ = форма, ответ есть среди вариантов', () => {
    const choice = buildRound(fixture, 0) // 'choice'
    expect(choice).toHaveLength(3)
    choice.forEach((s, i) => {
      expect(s.answer).toBe(fixture.forms[i].answerFr)
      expect(s.options).toContain(fixture.forms[i].answerFr)
      expect(s.fr).toContain('{}')
    })
    const bank = buildRound(fixture, 2) // 'bank'
    expect(bank[0].options!.length).toBeGreaterThanOrEqual(3)
  })

  it('tiles: токены — перестановка правильной фразы', () => {
    const tiles = buildRound(fixture, 1) // 'tiles'
    tiles.forEach((s) => {
      expect([...(s.tokens ?? [])].sort()).toEqual(
        (s.answer ?? '').split(' ').sort(),
      )
    })
  })

  it('match: solution указывает на верную форму в right', () => {
    const m = buildRound(fixture, 3)[0] // 'match'
    expect(m.left!.length).toBe(m.right!.length)
    m.solution!.forEach((sol, i) => {
      // right[solution[i]] должна быть формой, чья метка = left[i]
      const label = m.left![i]
      const wantForm = fixture.forms.find((f) => f.label === label)!.answerFr
      expect(m.right![sol]).toBe(wantForm)
    })
  })

  it('odd: ровно 3 фразы, wrongLine в диапазоне', () => {
    const o = buildRound(fixture, 4)[0]
    expect(o.lines).toHaveLength(3)
    expect(o.wrongLine).toBeGreaterThanOrEqual(0)
    expect(o.wrongLine).toBeLessThan(3)
  })

  it('детерминизм: одинаковый roundIdx → одинаковый круг', () => {
    expect(JSON.stringify(buildRound(fixture, 5))).toBe(
      JSON.stringify(buildRound(fixture, 5)),
    )
  })
})

describe('checkStep', () => {
  it('choice', () => {
    const s = buildRound(fixture, 0)[0]
    expect(checkStep(s, s.answer!)).toBe(true)
    expect(checkStep(s, 'нет')).toBe(false)
  })
  it('tiles', () => {
    const s = buildRound(fixture, 1)[0]
    expect(checkStep(s, (s.answer ?? '').split(' '))).toBe(true)
    expect(checkStep(s, ['abc', 'def'])).toBe(false)
  })
  it('match', () => {
    const s = buildRound(fixture, 3)[0]
    expect(checkStep(s, s.solution!)).toBe(true)
    expect(checkStep(s, s.solution!.map(() => 0))).toBe(false)
  })
  it('odd', () => {
    const s = buildRound(fixture, 4)[0]
    expect(checkStep(s, s.wrongLine!)).toBe(true)
    expect(checkStep(s, (s.wrongLine! + 1) % 3)).toBe(false)
  })
})
