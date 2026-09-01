// Лёгкий режим: интерактивная разминка по одному правилу.
// Чистая логика — из полей GrammarRule собирает упорядоченный список «битов».
// Детерминирована по rule.id, ничего не бросает, без зависимостей.

import { normalizeFr } from './check'
import type { GrammarRule } from './grammar'

export type WarmupBeat =
  | { kind: 'prime'; id: string; topicRu: string; options: string[] }
  | {
      kind: 'guess'
      id: string
      variant: 'cloze' | 'translate' | 'familiar'
      promptRu: string
      displayFr?: string
      options: string[]
      answerIndex: number // -1, когда allowAny
      allowAny: boolean
    }
  | {
      kind: 'reveal'
      id: string
      titleFr: string
      titleRu: string
      plainRu?: string
      summaryRu: string
      formationLines: string[]
      example?: { fr: string; ru: string }
    }
  | { kind: 'explore'; id: string; items: { term: string; note: string }[] }
  | {
      kind: 'build'
      id: string
      promptRu: string
      ru: string
      tokens: string[]
      answer: string
    }
  | { kind: 'readiness'; id: 'readiness' }

// --- Детерминированный ГПСЧ без зависимостей ---
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const stripEdges = (w: string): string =>
  w.replace(/^[«»"'“”(]+/, '').replace(/[.,!?;:»«"“”)]+$/, '')

// Закрытые классы форм для cloze-догадки. Ключ ищем по словам в titleFr+summaryRu.
const CLASS_TABLE: { test: RegExp; words: string[] }[] = [
  {
    test: /article|artikl|артикл/i,
    words: ['le', 'la', "l'", 'les', 'un', 'une', 'des', 'du', 'de'],
  },
  {
    test: /pr[ée]position|villes?|pays|города|стран/i,
    words: ['à', 'en', 'au', 'aux', 'dans', 'de', 'du'],
  },
  {
    test: /n[ée]gation|отрицан/i,
    words: ['ne', "n'", 'pas', 'plus', 'jamais', 'rien', 'personne'],
  },
  {
    test: /\bquel\b|вопросительн/i,
    words: ['quel', 'quelle', 'quels', 'quelles'],
  },
  {
    test: /être|avoir|pr[ée]sent|настоящ|спряжен/i,
    words: [
      'suis', 'es', 'est', 'sommes', 'êtes', 'sont',
      'ai', 'as', 'a', 'avons', 'avez', 'ont',
    ],
  },
]

function singleWordList(...groups: string[][]): string[] {
  return groups
    .flat()
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/\s/.test(s))
}

function classWordsFor(rule: GrammarRule): string[] {
  const hay = `${rule.titleFr} ${rule.summaryRu}`
  const fromTable = CLASS_TABLE.filter((c) => c.test.test(hay)).flatMap(
    (c) => c.words,
  )
  const fromRule = singleWordList(
    rule.triggers,
    Object.keys(rule.keyExceptions),
    Object.values(rule.keyExceptions),
  )
  // дедуп по нормализованной форме
  const seen = new Set<string>()
  const out: string[] = []
  for (const w of [...fromTable, ...fromRule]) {
    const n = normalizeFr(w)
    if (n && !seen.has(n)) {
      seen.add(n)
      out.push(w)
    }
  }
  return out
}

function buildClozeGuess(
  rule: GrammarRule,
  rng: () => number,
): Extract<WarmupBeat, { kind: 'guess' }> | null {
  const ex = rule.examples[0]
  if (!ex) return null
  const pool = classWordsFor(rule)
  if (pool.length < 3) return null
  const poolNorm = new Set(pool.map(normalizeFr))

  const words = ex.fr.split(/\s+/)
  const blankIdx = words.findIndex((w) => poolNorm.has(normalizeFr(stripEdges(w))))
  if (blankIdx === -1) return null

  const answer = stripEdges(words[blankIdx])
  const answerNorm = normalizeFr(answer)
  const distractors: string[] = []
  const usedNorm = new Set([answerNorm])
  for (const w of pool) {
    const n = normalizeFr(w)
    if (!usedNorm.has(n)) {
      usedNorm.add(n)
      distractors.push(w)
    }
    if (distractors.length >= 3) break
  }
  if (distractors.length < 2) return null

  const options = seededShuffle([answer, ...distractors], rng)
  return {
    kind: 'guess',
    id: 'guess',
    variant: 'cloze',
    promptRu: 'Что на месте пропуска?',
    displayFr: words.map((w, i) => (i === blankIdx ? '___' : w)).join(' '),
    options,
    answerIndex: options.indexOf(answer),
    allowAny: false,
  }
}

function buildTranslateGuess(
  rule: GrammarRule,
  rng: () => number,
): Extract<WarmupBeat, { kind: 'guess' }> | null {
  const ex = rule.examples[0]
  if (!ex) return null
  const answer = ex.ru.trim()
  const answerNorm = normalizeFr(answer)
  const decoys: string[] = []
  const usedNorm = new Set([answerNorm])
  for (const e of rule.examples.slice(1)) {
    const n = normalizeFr(e.ru)
    if (e.ru.trim() && !usedNorm.has(n)) {
      usedNorm.add(n)
      decoys.push(e.ru.trim())
    }
    if (decoys.length >= 2) break
  }
  if (decoys.length < 1) return null

  const options = seededShuffle([answer, ...decoys], rng)
  return {
    kind: 'guess',
    id: 'guess',
    variant: 'translate',
    promptRu: 'Как это переводится?',
    displayFr: ex.fr,
    options,
    answerIndex: options.indexOf(answer),
    allowAny: false,
  }
}

function buildFamiliarGuess(
  rule: GrammarRule,
): Extract<WarmupBeat, { kind: 'guess' }> {
  const first = (rule.summaryRu.split(/(?<=[.!?])\s/)[0] ?? rule.summaryRu).trim()
  const clamped = first.length > 140 ? `${first.slice(0, 137)}…` : first
  return {
    kind: 'guess',
    id: 'guess',
    variant: 'familiar',
    promptRu: `«${clamped}» — знакомо?`,
    options: ['Да, узнаю', 'Смутно', 'Впервые слышу'],
    answerIndex: -1,
    allowAny: true,
  }
}

function buildGuess(
  rule: GrammarRule,
  rng: () => number,
): Extract<WarmupBeat, { kind: 'guess' }> {
  return (
    buildClozeGuess(rule, rng) ??
    buildTranslateGuess(rule, rng) ??
    buildFamiliarGuess(rule)
  )
}

function buildExplore(
  rule: GrammarRule,
): Extract<WarmupBeat, { kind: 'explore' }> | null {
  const items = Object.entries(rule.keyExceptions)
    .map(([term, note]) => ({ term: term.trim(), note: (note ?? '').trim() }))
    .filter((x) => x.term && x.note)
    .slice(0, 4)
  if (items.length === 0) return null
  return { kind: 'explore', id: 'explore', items }
}

function buildBuild(
  rule: GrammarRule,
  rng: () => number,
): Extract<WarmupBeat, { kind: 'build' }> | null {
  for (const ex of rule.examples) {
    const clean = ex.fr.replace(/[.!?]+$/, '').trim()
    const words = clean.split(/\s+/).filter(Boolean)
    if (words.length < 3 || words.length > 9) continue
    let tokens = seededShuffle(words, rng)
    if (tokens.join(' ') === clean) tokens = seededShuffle(words, rng)
    return {
      kind: 'build',
      id: 'build',
      promptRu: 'Соберите фразу',
      ru: ex.ru,
      tokens,
      answer: clean,
    }
  }
  return null
}

/** Сравнение собранной фразы с ответом (для WordBuildPane). */
export function buildAnswerMatches(picked: string[], answer: string): boolean {
  return normalizeFr(picked.join(' ')) === normalizeFr(answer)
}

/** Собрать разминку по одному правилу. */
export function buildWarmup(rule: GrammarRule): WarmupBeat[] {
  const rng = mulberry32(hashSeed(rule.id))
  const beats: WarmupBeat[] = []

  beats.push({
    kind: 'prime',
    id: 'prime',
    topicRu: rule.titleRu,
    options: ['Вижу впервые', 'Что-то помню', 'Уверенно себя чувствую'],
  })

  beats.push(buildGuess(rule, rng))

  beats.push({
    kind: 'reveal',
    id: 'reveal',
    titleFr: rule.titleFr,
    titleRu: rule.titleRu,
    ...(rule.plainRu ? { plainRu: rule.plainRu } : {}),
    summaryRu: rule.summaryRu,
    formationLines: rule.formationRule
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    example: rule.examples[0],
  })

  const explore = buildExplore(rule)
  if (explore) beats.push(explore)

  const build = buildBuild(rule, rng)
  if (build) beats.push(build)

  beats.push({ kind: 'readiness', id: 'readiness' })
  return beats
}
