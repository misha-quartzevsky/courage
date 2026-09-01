// Словарь урока: собрать ВСЕ слова спринта с переводом (не выборочно).
// Источники двуязычных данных на уровне слов: пары match, односложные choice
// (fr → перевод), learnedWords из вердиктов Gemini по dialogue.

import type { GlossItem, SprintExercise } from './types'

export type { GlossItem }

const GLOSS_CAP = 40

/** Дедуп по нормализованному fr (первый непустой побеждает), чистка, кап.
 *  Пример-предложение сохраняется; если у первой записи его нет, а у дубля есть —
 *  запись дополняется. */
export function dedupeGloss(items: (GlossItem | null | undefined)[]): GlossItem[] {
  const by = new Map<string, GlossItem>()
  for (const it of items) {
    if (!it) continue
    const fr = (it.fr ?? '').trim()
    const ru = (it.ru ?? '').trim()
    if (fr.length < 2 || !ru) continue
    const key = fr.toLowerCase()
    const ex =
      it.exampleFr?.trim() && it.exampleRu?.trim()
        ? { exampleFr: it.exampleFr.trim(), exampleRu: it.exampleRu.trim() }
        : {}
    const cur = by.get(key)
    if (!cur) by.set(key, { fr, ru, ...ex })
    else if (!cur.exampleFr && 'exampleFr' in ex) by.set(key, { ...cur, ...ex })
  }
  return [...by.values()].slice(0, GLOSS_CAP)
}

// Убрать ведущий артикль/предлог — для поиска слова внутри фразы.
function coreWord(fr: string): string {
  return fr
    .trim()
    .toLowerCase()
    .replace(/^(l['’]|d['’]|(le|la|les|un|une|des|du|de\s+la|de|au|aux)\s+)/, '')
    .trim()
}

// Двуязычные фразы спринта (fr-строка + её перевод) — из упражнений и мини-текста.
function sprintSentences(
  exs: SprintExercise[],
  reading?: { fr: string; ru: string },
): { fr: string; ru: string }[] {
  const out: { fr: string; ru: string }[] = []
  for (const ex of exs) {
    if (ex.kind === 'match') continue
    const ru = ex.sentenceRu?.trim()
    if (!ru) continue
    let fr = ''
    if (ex.kind === 'gap') {
      let i = 0
      fr = ex.textFr.replace(/\{\}/g, () => ex.blanks[i++]?.answer ?? '…')
    } else if (ex.kind === 'choice' || ex.kind === 'dialogue') fr = ex.promptFr
    else if (ex.kind === 'order') fr = ex.answer
    else if (ex.kind === 'transform') fr = ex.answer
    if (fr.trim()) out.push({ fr: fr.trim(), ru })
  }
  if (reading?.fr && reading.ru) {
    const fs = reading.fr.split(/(?<=[.!?])\s+/)
    const rs = reading.ru.split(/(?<=[.!?])\s+/)
    if (fs.length === rs.length)
      fs.forEach((f, i) => f.trim() && out.push({ fr: f.trim(), ru: rs[i].trim() }))
  }
  return out
}

/** Проставить каждому слову пример-предложение с переводом из фраз спринта. */
export function attachExamples(
  items: GlossItem[],
  exercises: SprintExercise[],
  reading?: { fr: string; ru: string },
): GlossItem[] {
  const sents = sprintSentences(exercises, reading)
  return items.map((it) => {
    if (it.exampleFr && it.exampleRu) return it
    const core = coreWord(it.fr)
    if (core.length < 2) return it
    const hit = sents.find((s) => s.fr.toLowerCase().includes(core))
    return hit ? { ...it, exampleFr: hit.fr, exampleRu: hit.ru } : it
  })
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

/** Объединение всех источников слов спринта, модель — вперёд. Каждому слову
 *  проставляется пример-предложение из фраз спринта / мини-текста. */
export function buildSessionGlossary(o: {
  modelGlossary?: GlossItem[]
  exercises: SprintExercise[]
  verdictWords?: GlossItem[]
  reading?: { fr: string; ru: string }
}): GlossItem[] {
  const deduped = dedupeGloss([
    ...(o.modelGlossary ?? []),
    ...glossaryFromExercises(o.exercises),
    ...(o.verdictWords ?? []),
  ])
  return attachExamples(deduped, o.exercises, o.reading)
}
