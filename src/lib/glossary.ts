// Словарь урока: собрать ВСЕ слова спринта с переводом (не выборочно).
// Источники двуязычных данных на уровне слов: пары match, односложные choice
// (fr → перевод), learnedWords из вердиктов Gemini по dialogue.

import type { GlossItem, SprintExercise } from './types'

export type { GlossItem }

const GLOSS_CAP = 40

/** Дедуп по нормализованному fr (первый непустой побеждает), чистка, кап. */
export function dedupeGloss(items: (GlossItem | null | undefined)[]): GlossItem[] {
  const by = new Map<string, GlossItem>()
  for (const it of items) {
    if (!it) continue
    const fr = (it.fr ?? '').trim()
    const ru = (it.ru ?? '').trim()
    if (fr.length < 2 || !ru) continue
    const key = fr.toLowerCase()
    if (!by.has(key)) by.set(key, { fr, ru })
  }
  return [...by.values()].slice(0, GLOSS_CAP)
}

const SINGLE_TOKEN = /^\S+$/

/** Слова из структуры упражнений (без сети): пары match + односложные choice. */
export function glossaryFromExercises(exs: SprintExercise[]): GlossItem[] {
  const out: GlossItem[] = []
  for (const ex of exs) {
    if (ex.kind === 'match') {
      for (const p of ex.pairs) out.push({ fr: p.fr, ru: p.ru })
    } else if (ex.kind === 'choice') {
      const fr = ex.promptFr.trim()
      const ru = ex.options[ex.answerIndex]
      if (SINGLE_TOKEN.test(fr) && ru) out.push({ fr, ru })
    }
  }
  return out
}

/** Объединение всех источников слов спринта, модель — вперёд. */
export function buildSessionGlossary(o: {
  modelGlossary?: GlossItem[]
  exercises: SprintExercise[]
  verdictWords?: GlossItem[]
}): GlossItem[] {
  return dedupeGloss([
    ...(o.modelGlossary ?? []),
    ...glossaryFromExercises(o.exercises),
    ...(o.verdictWords ?? []),
  ])
}
