// Единственный риск-тест проекта (см. AGENTS.md §4):
// парсинг JSON от Gemini — то, что ломается тихо и незаметно (EXP-001).
import { describe, expect, it } from 'vitest'
import { sanitizeSprint, sanitizeVerdict, getFallbackSprint } from './gemini'
import { PERSONAS } from './personas'

describe('sanitizeSprint', () => {
  it('принимает чистый валидный JSON', () => {
    const text = JSON.stringify({
      unitId: 'a1-u2-a-la-banque',
      unitTitleFr: 'Ouvrir un compte',
      level: 'A1',
      durationMinutes: 5,
      situation: { titleFr: 'À la banque', contextFr: 'Вы в банке' },
      exercises: [
        {
          id: 'ex-1',
          promptFr: 'Bonjour, je peux vous aider ?',
          promptRu: 'Поздоровайтесь и представьтесь',
          expectedKeyPhrases: ['Je m\'appelle', 'Bonjour'],
        },
      ],
    })
    const sprint = sanitizeSprint(text)
    expect(sprint).not.toBeNull()
    expect(sprint?.exercises).toHaveLength(1)
    expect(sprint?.level).toBe('A1')
  })

  it('вырезает ```json-обёртку и текст вокруг (характерно для Gemini)', () => {
    const wrapped = 'Вот ваш спринт:\n```json\n{"unitId":"a1-u3","unitTitleFr":"Au restaurant","level":"A2","durationMinutes":6,"situation":{"titleFr":"Au restaurant","contextFr":"Вы в ресторане"},"exercises":[{"id":"ex-1","promptFr":"Vous désirez ?","promptRu":"Сделайте заказ","expectedKeyPhrases":["Je voudrais"]}]}\n```\nПриятной практики!'
    const sprint = sanitizeSprint(wrapped)
    expect(sprint?.unitId).toBe('a1-u3')
    expect(sprint?.exercises[0].expectedKeyPhrases).toEqual(['Je voudrais'])
  })

  it('отбрасывает невалидный JSON (галлюцинация/обрыв модели) — null', () => {
    expect(sanitizeSprint('К сожалению, произошла ошибка.')).toBeNull()
    expect(sanitizeSprint('{ "unitId": "без закрывающей скобки"')).toBeNull()
    expect(sanitizeSprint('')).toBeNull()
  })

  it('отбрасывает объект с галлюцинированной схемой (нет упражнений)', () => {
    const text = JSON.stringify({
      unitId: 'a1-u1-se-presenter',
      unitTitleFr: 'Se présenter',
      level: 'A1',
      durationMinutes: 5,
      situation: { titleFr: 'X', contextFr: 'Y' },
      exercises: [],
    })
    expect(sanitizeSprint(text)).toBeNull()
  })

  it('фильтрует упражнения с мусорными полями', () => {
    const text = JSON.stringify({
      unitId: 'a1-u1-se-presenter',
      unitTitleFr: 'Se présenter',
      level: 'A1',
      durationMinutes: 5,
      situation: { titleFr: 'X', contextFr: 'Y' },
      exercises: [
        { id: 'ex-1', promptFr: 'A', promptRu: 'B', expectedKeyPhrases: ['x'] },
        { id: 'bad', promptFr: 42, promptRu: 'B', expectedKeyPhrases: [] },
      ],
    })
    const sprint = sanitizeSprint(text)
    expect(sprint?.exercises).toHaveLength(1)
    expect(sprint?.exercises[0].id).toBe('ex-1')
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
  it('всегда возвращает валидную сессию на 3 упражнения без сети', () => {
    const sprint = getFallbackSprint(PERSONAS.surgeon, 'A1')
    expect(sprint.exercises).toHaveLength(3)
    expect(sprint.unitTitleFr).toBeTruthy()
    expect(sprint.level).toBe('A1')
    expect(sanitizeSprint(JSON.stringify(sprint))).not.toBeNull()
  })
})