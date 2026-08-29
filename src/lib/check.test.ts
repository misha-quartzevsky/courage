import { describe, expect, it } from 'vitest'
import { checkExercise, normalizeFr } from './check'
import type { SprintExercise } from './types'

describe('normalizeFr', () => {
  it('приводит регистр, апострофы, пробелы, концевую пунктуацию', () => {
    expect(normalizeFr("  J’ai   FAIM. ")).toBe("j'ai faim")
    expect(normalizeFr('Bonjour !')).toBe('bonjour')
    expect(normalizeFr("j' ai 30 ans")).toBe("j'ai 30 ans")
  })
})

describe('checkExercise', () => {
  it('gap — все пропуски по answer/alts', () => {
    const ex: SprintExercise = {
      kind: 'gap',
      id: 'g',
      promptRu: 'Вставьте',
      textFr: 'Je {} à Lyon et tu {} à Nice.',
      blanks: [{ answer: 'habite' }, { answer: 'habites', alts: ['habite'] }],
    }
    expect(checkExercise(ex, ['habite', 'habites']).correct).toBe(true)
    expect(checkExercise(ex, ['Habite ', 'habite']).correct).toBe(true)
    expect(checkExercise(ex, ['habite', 'vis']).correct).toBe(false)
    expect(checkExercise(ex, ['habite']).correct).toBe(false)
  })

  it('choice — по индексу', () => {
    const ex: SprintExercise = {
      kind: 'choice',
      id: 'c',
      promptRu: 'Выберите',
      promptFr: 'Il ___ parti.',
      options: ['a', 'est', 'ont'],
      answerIndex: 1,
    }
    expect(checkExercise(ex, 1).correct).toBe(true)
    expect(checkExercise(ex, 0).correct).toBe(false)
    expect(checkExercise(ex, 1).expected).toBe('est')
  })

  it('order — сборка фразы, устойчиво к регистру/пунктуации', () => {
    const ex: SprintExercise = {
      kind: 'order',
      id: 'o',
      promptRu: 'Соберите',
      tokens: ['ski', 'du', 'fais', 'je'],
      answer: 'Je fais du ski',
    }
    expect(checkExercise(ex, ['je', 'fais', 'du', 'ski']).correct).toBe(true)
    expect(checkExercise(ex, ['je', 'du', 'fais', 'ski']).correct).toBe(false)
  })

  it('transform — по answer/alts', () => {
    const ex: SprintExercise = {
      kind: 'transform',
      id: 't',
      promptRu: 'В passé composé',
      sourceFr: 'Je mange une pomme.',
      answer: "J'ai mangé une pomme.",
      alts: ['jai mangé une pomme'],
    }
    expect(checkExercise(ex, "J'ai mangé une pomme").correct).toBe(true)
    expect(checkExercise(ex, 'Je mange une pomme').correct).toBe(false)
  })

  it('match — тождественное отображение', () => {
    const ex: SprintExercise = {
      kind: 'match',
      id: 'm',
      promptRu: 'Соедините',
      pairs: [
        { fr: 'la boxe', ru: 'бокс' },
        { fr: 'le ski', ru: 'лыжи' },
      ],
    }
    expect(checkExercise(ex, [0, 1]).correct).toBe(true)
    expect(checkExercise(ex, [1, 0]).correct).toBe(false)
  })
})
