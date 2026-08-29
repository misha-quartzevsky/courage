// Локальная проверка упражнений (всё, кроме dialogue). Без сети.

import type { SprintExercise } from './types'

/** Нормализация для сравнения: регистр, пробелы, апострофы, концевая пунктуация. */
export function normalizeFr(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s*'\s*/g, "'") // элизия без пробелов: «j' ai» === «j'ai»
    .replace(/\s+/g, ' ')
    .replace(/[.!?;:]+$/, '')
    .trim()
}

function matchesAny(got: string, answer: string, alts?: string[]): boolean {
  const g = normalizeFr(got)
  return [answer, ...(alts ?? [])].some((a) => normalizeFr(a) === g)
}

export interface CheckResult {
  correct: boolean
  expected: string // правильный вариант для показа
  got: string // что ввёл ученик
}

/**
 * answer формат по типу:
 *  gap      — string[] по числу пропусков
 *  choice   — number (индекс варианта)
 *  order    — string[] (слова в выбранном порядке)
 *  transform— string
 *  match    — number[] (для строки i слева — индекс выбранной пары)
 */
export function checkExercise(
  ex: SprintExercise,
  answer: unknown,
): CheckResult {
  switch (ex.kind) {
    case 'gap': {
      const arr = Array.isArray(answer) ? (answer as string[]) : []
      const correct =
        arr.length === ex.blanks.length &&
        ex.blanks.every((b, i) => matchesAny(arr[i] ?? '', b.answer, b.alts))
      return {
        correct,
        expected: ex.blanks.map((b) => b.answer).join(' · '),
        got: arr.join(' · '),
      }
    }
    case 'choice': {
      const i = typeof answer === 'number' ? answer : -1
      return {
        correct: i === ex.answerIndex,
        expected: ex.options[ex.answerIndex] ?? '',
        got: ex.options[i] ?? '—',
      }
    }
    case 'order': {
      const got = Array.isArray(answer)
        ? (answer as string[]).join(' ')
        : String(answer ?? '')
      return {
        correct: normalizeFr(got) === normalizeFr(ex.answer),
        expected: ex.answer,
        got,
      }
    }
    case 'transform': {
      const got = String(answer ?? '')
      return {
        correct: matchesAny(got, ex.answer, ex.alts),
        expected: ex.answer,
        got,
      }
    }
    case 'match': {
      const arr = Array.isArray(answer) ? (answer as number[]) : []
      const correct =
        arr.length === ex.pairs.length && arr.every((v, i) => v === i)
      return {
        correct,
        expected: ex.pairs.map((p) => `${p.fr} — ${p.ru}`).join('; '),
        got: '',
      }
    }
    case 'dialogue':
      return { correct: false, expected: '', got: '' }
  }
}
