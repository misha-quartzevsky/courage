import { describe, expect, it } from 'vitest'
import {
  attachExamples,
  buildSessionGlossary,
  dedupeGloss,
  glossaryFromExercises,
} from './glossary'
import type { SprintExercise } from './types'

describe('dedupeGloss', () => {
  it('дедуп по fr без учёта регистра, первый непустой побеждает', () => {
    const out = dedupeGloss([
      { fr: 'Maison', ru: 'дом' },
      { fr: 'maison', ru: 'здание' },
    ])
    expect(out).toEqual([{ fr: 'Maison', ru: 'дом' }])
  })

  it('выкидывает пустые, односимвольные fr и без перевода', () => {
    const out = dedupeGloss([
      { fr: '', ru: 'x' },
      { fr: 'a', ru: 'а' },
      { fr: 'chat', ru: '' },
      null,
      undefined,
      { fr: '  chien  ', ru: '  собака ' },
    ])
    expect(out).toEqual([{ fr: 'chien', ru: 'собака' }])
  })

  it('ограничивает длину', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ fr: `mot${i}`, ru: `${i}` }))
    expect(dedupeGloss(many).length).toBeLessThanOrEqual(40)
  })
})

describe('glossaryFromExercises', () => {
  it('берёт пары из match и односложные choice', () => {
    const exs: SprintExercise[] = [
      {
        id: 'm',
        kind: 'match',
        promptRu: 'x',
        pairs: [
          { fr: 'la boxe', ru: 'бокс' },
          { fr: 'le ski', ru: 'лыжи' },
        ],
      },
      {
        id: 'c1',
        kind: 'choice',
        promptRu: 'x',
        promptFr: 'nager',
        sentenceRu: 'плавать',
        options: ['плавать', 'бегать'],
        answerIndex: 0,
      },
      {
        id: 'c2',
        kind: 'choice',
        promptRu: 'x',
        promptFr: 'Il ___ parti.',
        sentenceRu: 'Он уехал.',
        options: ['a', 'est'],
        answerIndex: 1,
      },
    ]
    expect(glossaryFromExercises(exs)).toEqual([
      { fr: 'la boxe', ru: 'бокс' },
      { fr: 'le ski', ru: 'лыжи' },
      { fr: 'nager', ru: 'плавать' },
    ])
  })
})

describe('attachExamples', () => {
  const exs: SprintExercise[] = [
    {
      id: 't1',
      kind: 'transform',
      promptRu: 'x',
      sourceFr: 'Je mange.',
      sentenceRu: 'Я купил хлеб в булочной.',
      answer: "J'ai acheté du pain à la boulangerie.",
    },
  ]

  it('проставляет пример из фразы спринта, снимая ведущий артикль', () => {
    const [w] = attachExamples([{ fr: 'le pain', ru: 'хлеб' }], exs)
    expect(w.exampleFr).toBe("J'ai acheté du pain à la boulangerie.")
    expect(w.exampleRu).toBe('Я купил хлеб в булочной.')
  })

  it('не трогает слово без совпадения и уже имеющийся пример', () => {
    const out = attachExamples(
      [
        { fr: 'chat', ru: 'кот' },
        { fr: 'pain', ru: 'хлеб', exampleFr: 'Mon pain.', exampleRu: 'Мой хлеб.' },
      ],
      exs,
    )
    expect(out[0].exampleFr).toBeUndefined()
    expect(out[1].exampleFr).toBe('Mon pain.')
  })

  it('берёт предложение из мини-текста, если в упражнениях нет', () => {
    const [w] = attachExamples([{ fr: 'soleil', ru: 'солнце' }], [], {
      fr: 'Il pleut. Le soleil brille demain.',
      ru: 'Идёт дождь. Завтра светит солнце.',
    })
    expect(w.exampleFr).toBe('Le soleil brille demain.')
  })
})

describe('buildSessionGlossary', () => {
  it('объединяет модель + упражнения + слова вердиктов, модель вперёд', () => {
    const exs: SprintExercise[] = [
      {
        id: 'm',
        kind: 'match',
        promptRu: 'x',
        pairs: [{ fr: 'la boxe', ru: 'бокс' }],
      },
    ]
    const out = buildSessionGlossary({
      modelGlossary: [{ fr: 'la boxe', ru: 'бокс (спорт)' }],
      exercises: exs,
      verdictWords: [{ fr: 'courir', ru: 'бежать' }],
    })
    expect(out).toEqual([
      { fr: 'la boxe', ru: 'бокс (спорт)' },
      { fr: 'courir', ru: 'бежать' },
    ])
  })
})
