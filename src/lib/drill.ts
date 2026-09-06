// Дрилл-тренажёр форм для A1: крутит формы правила по кругу, меняя формат.
// Данные — public/drills/<ruleId>.json (собирает scripts/build-drills.mjs).
// Чистый модуль: тестируется без DOM.

import type { Drill, DrillForm } from './types'
import { normalizeFr } from './check'

// --- Детерминированное перемешивание (seed = ruleId + номер круга) ---
function seeded(seedStr: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return ((h >>> 0) % 100000) / 100000
  }
}
function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// --- Загрузка ---
export type DrillFormat = 'choice' | 'tiles' | 'bank' | 'match' | 'odd'
export const DRILL_FORMATS: DrillFormat[] = ['choice', 'tiles', 'bank', 'match', 'odd']

let mem = new Map<string, Drill>()

export function parseDrill(raw: unknown): Drill | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  if (typeof d.ruleId !== 'string' || !d.ruleId) return null
  if (typeof d.titleRu !== 'string' || typeof d.plainRu !== 'string') return null
  if (!Array.isArray(d.forms)) return null
  const forms: DrillForm[] = []
  for (const f of d.forms) {
    if (!f || typeof f !== 'object') continue
    const fo = f as Record<string, unknown>
    if (typeof fo.label !== 'string' || typeof fo.answerFr !== 'string') continue
    if (!Array.isArray(fo.items)) continue
    const items = fo.items.filter(
      (it) =>
        it &&
        typeof (it as { fr: unknown }).fr === 'string' &&
        String((it as { fr: string }).fr).includes('{}') &&
        typeof (it as { ru: unknown }).ru === 'string' &&
        Array.isArray((it as { distractors: unknown }).distractors),
    ) as { fr: string; ru: string; distractors: string[] }[]
    if (items.length < 1) continue
    forms.push({ label: fo.label, answerFr: fo.answerFr, items })
  }
  if (forms.length < 2) return null
  const text =
    d.text &&
    typeof (d.text as { fr: unknown }).fr === 'string' &&
    typeof (d.text as { ru: unknown }).ru === 'string'
      ? { fr: (d.text as { fr: string }).fr, ru: (d.text as { ru: string }).ru }
      : undefined
  return {
    ruleId: d.ruleId,
    titleRu: d.titleRu,
    titleFr: typeof d.titleFr === 'string' ? d.titleFr : d.ruleId,
    plainRu: d.plainRu,
    ...(text ? { text } : {}),
    forms,
  }
}

export async function loadDrill(ruleId: string): Promise<Drill | null> {
  const hit = mem.get(ruleId)
  if (hit) return hit
  const res = await fetch(`/drills/${encodeURIComponent(ruleId)}.json`)
  if (!res.ok) return null
  const parsed = parseDrill(await res.json())
  if (parsed) mem.set(ruleId, parsed)
  return parsed
}

// Множество ruleId, у которых есть дрилл (public/drills/index.json). Кэш в памяти.
let indexMem: Set<string> | null = null
export async function loadDrillIndex(): Promise<Set<string>> {
  if (indexMem) return indexMem
  try {
    const res = await fetch('/drills/index.json')
    if (!res.ok) throw new Error(String(res.status))
    const raw = (await res.json()) as unknown
    indexMem = new Set(
      Array.isArray(raw)
        ? raw
            .map((e) => (e && typeof (e as { ruleId?: unknown }).ruleId === 'string' ? (e as { ruleId: string }).ruleId : null))
            .filter((x): x is string => !!x)
        : [],
    )
  } catch {
    indexMem = new Set()
  }
  return indexMem
}

// Только для тестов: подложить дрилл в кэш.
export function __setDrillCache(d: Drill): void {
  mem.set(d.ruleId, d)
}
export function __clearDrillCache(): void {
  mem = new Map()
}

// --- Один шаг круга (одно тапабельное задание) ---
export interface DrillStep {
  kind: DrillFormat
  promptRu: string
  formLabel?: string // метка формы (для учёта ошибок в круге), у per-form форматов
  fr: string // с {} для choice/bank; целая фраза для tiles/odd; '' для match
  ru?: string
  options?: string[] // choice/bank — кнопки
  answer?: string // choice/bank/tiles — правильная строка
  tokens?: string[] // tiles — перемешанные слова
  left?: string[] // match — левый столбец (метки форм), фиксирован
  right?: string[] // match — правый столбец (формы), перетасован
  solution?: number[] // match — solution[i] = индекс в right, верный для left[i]
  lines?: string[] // odd — 3 фразы
  wrongLine?: number // odd — индекс фразы с неверной формой
}

function bankOptions(drill: Drill, correct: string, rand: () => number): string[] {
  const uniq = Array.from(new Set(drill.forms.map((f) => f.answerFr)))
  let bank = uniq
  if (bank.length > 8) {
    const others = shuffle(
      uniq.filter((x) => x !== correct),
      rand,
    ).slice(0, 7)
    bank = [correct, ...others]
  }
  return shuffle(bank, rand)
}

// Построить круг `roundIdx`: формат ротируется, предложения — следующие по кругу.
export function buildRound(drill: Drill, roundIdx: number): DrillStep[] {
  const format = DRILL_FORMATS[roundIdx % DRILL_FORMATS.length]
  const rand = seeded(`${drill.ruleId}:${roundIdx}`)
  const forms = drill.forms

  if (format === 'choice' || format === 'bank') {
    return forms.map((f) => {
      const item = f.items[roundIdx % f.items.length]
      const options =
        format === 'bank'
          ? bankOptions(drill, f.answerFr, rand)
          : shuffle([f.answerFr, ...item.distractors.slice(0, 2)], rand)
      return {
        kind: format,
        promptRu: `Форма для «${f.label}»`,
        formLabel: f.label,
        fr: item.fr,
        ru: item.ru,
        options,
        answer: f.answerFr,
      }
    })
  }

  if (format === 'tiles') {
    return forms.map((f) => {
      const item = f.items[roundIdx % f.items.length]
      const full = item.fr.replace('{}', f.answerFr)
      const tokens = full
        .replace(/[.!?]+$/, '')
        .split(/\s+/)
        .filter(Boolean)
      return {
        kind: 'tiles',
        promptRu: `Соберите фразу («${f.label}»)`,
        formLabel: f.label,
        fr: full,
        ru: item.ru,
        tokens: shuffle(tokens, rand),
        answer: full.replace(/[.!?]+$/, ''),
      }
    })
  }

  if (format === 'match') {
    // Не больше 6 пар за раз — иначе сетка не читается. Уникализируем по форме.
    const uniqForms: DrillForm[] = []
    const seen = new Set<string>()
    for (const f of shuffle(forms, rand)) {
      if (seen.has(f.answerFr)) continue
      seen.add(f.answerFr)
      uniqForms.push(f)
      if (uniqForms.length === 6) break
    }
    const left = uniqForms.map((f) => f.label)
    const rightForms = shuffle(uniqForms, rand)
    const right = rightForms.map((f) => f.answerFr)
    const solution = uniqForms.map((f) => rightForms.indexOf(f))
    return [{ kind: 'match', promptRu: 'Соедините местоимение с формой', fr: '', left, right, solution }]
  }

  // odd — 3 фразы, одна с неверной формой
  const trio = shuffle(forms, rand).slice(0, 3)
  const wrongLine = Math.floor(rand() * 3)
  const lines = trio.map((f, i) => {
    const item = f.items[roundIdx % f.items.length]
    if (i === wrongLine) {
      const bad = item.distractors[0] ?? drill.forms.find((x) => x !== f)?.answerFr ?? f.answerFr
      return item.fr.replace('{}', bad)
    }
    return item.fr.replace('{}', f.answerFr)
  })
  return [
    {
      kind: 'odd',
      promptRu: 'Найдите фразу с ошибкой',
      fr: '',
      lines,
      wrongLine,
    },
  ]
}

// --- Проверка ответа на шаг ---
export function checkStep(step: DrillStep, answer: unknown): boolean {
  switch (step.kind) {
    case 'choice':
    case 'bank':
      return typeof answer === 'string' && normalizeFr(answer) === normalizeFr(step.answer ?? '')
    case 'tiles':
      return (
        Array.isArray(answer) &&
        normalizeFr((answer as string[]).join(' ')) === normalizeFr(step.answer ?? '')
      )
    case 'match':
      // answer: number[] — answer[i] = индекс в right, выбранный для строки left[i].
      if (!Array.isArray(answer) || !step.solution) return false
      return step.solution.every((sol, i) => (answer as number[])[i] === sol)
    case 'odd':
      return answer === step.wrongLine
    default:
      return false
  }
}
