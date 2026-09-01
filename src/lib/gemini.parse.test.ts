// Риск-тест: парсинг JSON от Gemini — то, что ломается тихо (AGENTS.md §4).
import { describe, expect, it } from 'vitest'
import { sanitizeSprint, sanitizeVerdict, getFallbackSprint } from './gemini'
import { DEMO_PERSONA } from './personas'
import { SYLLABUS } from './syllabus'

const OK_EXERCISES = [
  {
    kind: 'dialogue',
    id: 'e1',
    promptRu: 'Поздоровайтесь',
    promptFr: 'Bonjour !',
    sentenceRu: 'Здравствуйте!',
    expectedKeyPhrases: ['bonjour'],
  },
  {
    kind: 'gap',
    id: 'e2',
    promptRu: 'Вставьте',
    textFr: 'Je {} à Lyon.',
    sentenceRu: 'Я живу в Лионе.',
    blanks: [{ answer: 'habite' }],
  },
  {
    kind: 'choice',
    id: 'e3',
    promptRu: 'Выберите',
    promptFr: 'Il ___ parti.',
    sentenceRu: 'Он уехал.',
    options: ['a', 'est'],
    answerIndex: 1,
  },
]

function sprintJson(exercises: unknown[]): string {
  return JSON.stringify({
    durationMinutes: 5,
    situation: { titleFr: 'À la banque', contextFr: 'Вы в банке' },
    exercises,
  })
}

describe('sanitizeSprint', () => {
  it('принимает валидный JSON со смешанными типами упражнений', () => {
    const sprint = sanitizeSprint(sprintJson(OK_EXERCISES))
    expect(sprint).not.toBeNull()
    expect(sprint?.exercises).toHaveLength(3)
    expect(sprint?.exercises.map((e) => e.kind)).toEqual([
      'dialogue',
      'gap',
      'choice',
    ])
  })

  it('вырезает ```json-обёртку и текст вокруг', () => {
    const wrapped = `Вот спринт:\n\`\`\`json\n${sprintJson(OK_EXERCISES)}\n\`\`\`\nУдачи!`
    const sprint = sanitizeSprint(wrapped)
    expect(sprint?.exercises).toHaveLength(3)
  })

  it('unitId/unitTitleFr не обязательны — их ставит каталог', () => {
    const sprint = sanitizeSprint(sprintJson(OK_EXERCISES))
    expect(sprint?.unitId).toBe('')
  })

  it('отбрасывает невалидный JSON', () => {
    expect(sanitizeSprint('К сожалению, ошибка.')).toBeNull()
    expect(sanitizeSprint('{ "durationMinutes": 5')).toBeNull()
    expect(sanitizeSprint('')).toBeNull()
  })

  it('меньше 3 валидных упражнений — null', () => {
    expect(sanitizeSprint(sprintJson([]))).toBeNull()
    expect(sanitizeSprint(sprintJson(OK_EXERCISES.slice(0, 2)))).toBeNull()
  })

  it('фильтрует битые упражнения по kind', () => {
    const sprint = sanitizeSprint(
      sprintJson([
        ...OK_EXERCISES,
        { kind: 'gap', id: 'bad', promptRu: 'x', textFr: 'нет пропуска', blanks: [{ answer: 'a' }] },
        { kind: 'choice', id: 'bad2', promptRu: 'x', promptFr: 'y', options: ['a'], answerIndex: 5 },
        { kind: 'unknown', id: 'bad3', promptRu: 'x' },
      ]),
    )
    expect(sprint?.exercises).toHaveLength(3)
    expect(sprint?.exercises.every((e) => e.id.startsWith('e'))).toBe(true)
  })

  it('order и match парсятся', () => {
    const sprint = sanitizeSprint(
      sprintJson([
        OK_EXERCISES[0],
        { kind: 'order', id: 'o', promptRu: 'соберите', sentenceRu: 'Я катаюсь на лыжах', tokens: ['je', 'fais', 'du', 'ski'], answer: 'Je fais du ski' },
        { kind: 'match', id: 'm', promptRu: 'соедините', pairs: [{ fr: 'la boxe', ru: 'бокс' }, { fr: 'le ski', ru: 'лыжи' }] },
      ]),
    )
    expect(sprint?.exercises.map((e) => e.kind)).toEqual(['dialogue', 'order', 'match'])
  })

  it('упражнение кроме match без sentenceRu отбрасывается', () => {
    for (const bad of [
      { kind: 'dialogue', id: 'x', promptRu: 'x', promptFr: 'Bonjour !', expectedKeyPhrases: ['bonjour'] },
      { kind: 'gap', id: 'x', promptRu: 'x', textFr: 'Je {} ici.', blanks: [{ answer: 'suis' }] },
      { kind: 'choice', id: 'x', promptRu: 'x', promptFr: 'Il ___ parti.', options: ['a', 'est'], answerIndex: 1 },
      { kind: 'order', id: 'x', promptRu: 'x', tokens: ['je', 'fais'], answer: 'Je fais' },
      { kind: 'transform', id: 'x', promptRu: 'x', sourceFr: 'Je mange.', answer: "J'ai mangé." },
    ]) {
      const sprint = sanitizeSprint(sprintJson([...OK_EXERCISES, bad]))
      // остаются только 3 валидных OK_EXERCISES, битое — выброшено
      expect(sprint?.exercises).toHaveLength(3)
    }
  })

  it('match без sentenceRu принимается', () => {
    const sprint = sanitizeSprint(
      sprintJson([
        ...OK_EXERCISES,
        { kind: 'match', id: 'm', promptRu: 'соедините', pairs: [{ fr: 'la boxe', ru: 'бокс' }, { fr: 'le ski', ru: 'лыжи' }] },
      ]),
    )
    expect(sprint?.exercises.map((e) => e.kind)).toContain('match')
  })
})

describe('sanitizeVerdict', () => {
  it('нормализует числа вне диапазона 0..100', () => {
    const verdict = sanitizeVerdict(
      JSON.stringify({
        transcript: 'Bonjour',
        accuracy: 150,
        fluency: -10,
        passed: true,
        issues: [],
        learnedWords: [],
        feedbackFr: 'Bien !',
        feedbackRu: 'Хорошо!',
      }),
    )
    expect(verdict?.accuracy).toBe(100)
    expect(verdict?.fluency).toBe(0)
  })

  it('отбрасывает verdict без обязательных полей', () => {
    expect(sanitizeVerdict('{"accuracy": 90}')).toBeNull()
    expect(sanitizeVerdict('не json вообще')).toBeNull()
  })

  it('пропускает невалидные issues и learnedWords, сохраняя корректные', () => {
    const verdict = sanitizeVerdict(
      JSON.stringify({
        transcript: 'Je fais du ski',
        accuracy: 80,
        fluency: 75,
        passed: true,
        issues: [{ snippet: 'je fais ski', correctionFr: 'je fais du ski', correctionRu: 'нужен артикль' }],
        learnedWords: [
          { fr: 'la boxe', ru: 'бокс' },
          { fr: 99, ru: 'битое' },
        ],
        feedbackFr: 'Très bien !',
        feedbackRu: 'Очень хорошо!',
      }),
    )
    expect(verdict?.issues).toHaveLength(1)
    expect(verdict?.learnedWords).toEqual([{ fr: 'la boxe', ru: 'бокс' }])
  })
})

describe('getFallbackSprint', () => {
  it('валидная сессия из 3–6 упражнений без сети', () => {
    const sprint = getFallbackSprint(DEMO_PERSONA, 'A1', SYLLABUS[0])
    expect(sprint.exercises.length).toBeGreaterThanOrEqual(3)
    expect(sprint.exercises.length).toBeLessThanOrEqual(6)
    expect(sprint.unitId).toBe(SYLLABUS[0].id)
    expect(sprint.level).toBe('A1')
    expect(sanitizeSprint(JSON.stringify(sprint))).not.toBeNull()
  })

  it('у каждого не-match упражнения есть непустой sentenceRu', () => {
    const sprint = getFallbackSprint(DEMO_PERSONA, 'A1', SYLLABUS[0])
    for (const ex of sprint.exercises) {
      if (ex.kind === 'match') continue
      expect(ex.sentenceRu && ex.sentenceRu.length > 0).toBe(true)
    }
  })

  it('первые два упражнения — диалоговые', () => {
    const sprint = getFallbackSprint(DEMO_PERSONA, 'A2', SYLLABUS[13])
    expect(sprint.exercises[0].kind).toBe('dialogue')
    expect(sprint.exercises[1].kind).toBe('dialogue')
  })
})
