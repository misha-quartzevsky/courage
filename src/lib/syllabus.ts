// Канонический каталог юнитов Édito A1–A2.
// Источник — grammar-rules-A1-A2.json (там у каждого правила есть level + unit).
// Правила сворачиваются в юниты один раз при загрузке модуля: порядок и состав
// курса берём отсюда, а не из выдумок модели.

import rawRules from '../../grammar-rules-A1-A2.json'
import type { CefrLevel } from './types'

interface GrammarRule {
  id: string
  level: string
  unit: number
  category: string
  title_fr: string
  title_ru: string
}

export interface SyllabusUnit {
  id: string // 'a1-u3'
  level: CefrLevel // 'A1' | 'A2'
  unit: number // 1..12
  titleFr: string // тема юнита по-французски (из первого правила)
  titleRu: string
  ruleIds: string[] // все правила юнита — задел под Aide-Mémoire
}

const LEVEL_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2']

function buildSyllabus(): SyllabusUnit[] {
  const rules = rawRules as GrammarRule[]
  const byKey = new Map<string, SyllabusUnit>()

  for (const rule of rules) {
    const level = rule.level.toUpperCase() as CefrLevel
    const key = `${level.toLowerCase()}-u${rule.unit}`
    const existing = byKey.get(key)
    if (existing) {
      existing.ruleIds.push(rule.id)
      continue
    }
    byKey.set(key, {
      id: key,
      level,
      unit: rule.unit,
      titleFr: rule.title_fr,
      titleRu: rule.title_ru,
      ruleIds: [rule.id],
    })
  }

  return [...byKey.values()].sort((a, b) => {
    const l = LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level)
    return l !== 0 ? l : a.unit - b.unit
  })
}

export const SYLLABUS: SyllabusUnit[] = buildSyllabus()

export function unitById(id: string): SyllabusUnit | undefined {
  return SYLLABUS.find((u) => u.id === id)
}

/** Уровни в порядке прохождения, с юнитами. */
export function syllabusByLevel(): { level: CefrLevel; units: SyllabusUnit[] }[] {
  const out: { level: CefrLevel; units: SyllabusUnit[] }[] = []
  for (const u of SYLLABUS) {
    let bucket = out[out.length - 1]
    if (!bucket || bucket.level !== u.level) {
      bucket = { level: u.level, units: [] }
      out.push(bucket)
    }
    bucket.units.push(u)
  }
  return out
}

/** Первый непройденный юнит в каноническом порядке (рекомендованный «дальше»). */
export function nextUnit(doneIds: Set<string>): SyllabusUnit {
  return SYLLABUS.find((u) => !doneIds.has(u.id)) ?? SYLLABUS[SYLLABUS.length - 1]
}
