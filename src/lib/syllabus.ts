// Канонический каталог юнитов Édito (A1–B1).
// Источник — RULES из grammar.ts: правила сворачиваются в юниты один раз при
// загрузке модуля. Порядок и состав курса берём отсюда, а не из выдумок модели.

import { RULES } from './grammar'
import type { CefrLevel } from './types'

export interface SyllabusUnit {
  id: string // 'a1-u3'
  level: CefrLevel // 'A1' | 'A2' | 'B1'
  unit: number // 1..12
  titleFr: string // тема юнита по-французски (из первого правила)
  titleRu: string
  ruleIds: string[] // все правила юнита — для введения и справочника
}

const LEVEL_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2']

function levelIndex(l: CefrLevel): number {
  const i = LEVEL_ORDER.indexOf(l)
  return i === -1 ? 0 : i
}

function buildSyllabus(): SyllabusUnit[] {
  const byKey = new Map<string, SyllabusUnit>()

  for (const rule of RULES) {
    const key = `${rule.level.toLowerCase()}-u${rule.unit}`
    const existing = byKey.get(key)
    if (existing) {
      existing.ruleIds.push(rule.id)
      continue
    }
    byKey.set(key, {
      id: key,
      level: rule.level,
      unit: rule.unit,
      titleFr: rule.titleFr,
      titleRu: rule.titleRu,
      ruleIds: [rule.id],
    })
  }

  return [...byKey.values()].sort((a, b) => {
    const l = levelIndex(a.level) - levelIndex(b.level)
    return l !== 0 ? l : a.unit - b.unit
  })
}

export const SYLLABUS: SyllabusUnit[] = buildSyllabus()

export function unitById(id: string): SyllabusUnit | undefined {
  return SYLLABUS.find((u) => u.id === id)
}

/** Уровни, которые реально есть в каталоге, в порядке прохождения. */
export function availableLevels(): CefrLevel[] {
  const seen = new Set(SYLLABUS.map((u) => u.level))
  return LEVEL_ORDER.filter((l) => seen.has(l))
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

/** true, если юнит ниже стартового уровня ученика. */
export function isBelowLevel(unit: SyllabusUnit, fromLevel?: CefrLevel): boolean {
  return fromLevel ? levelIndex(unit.level) < levelIndex(fromLevel) : false
}

/** Все юниты уровня пройдены. */
export function levelComplete(
  level: CefrLevel,
  doneIds: Set<string>,
): boolean {
  const units = SYLLABUS.filter((u) => u.level === level)
  return units.length > 0 && units.every((u) => doneIds.has(u.id))
}

/** Прогресс по курсу, начиная со стартового уровня ученика. */
export function courseProgress(
  doneIds: Set<string>,
  fromLevel?: CefrLevel,
): { done: number; total: number; pct: number; lastLevel: CefrLevel } {
  const scope = SYLLABUS.filter((u) => !isBelowLevel(u, fromLevel))
  const done = scope.filter((u) => doneIds.has(u.id)).length
  const total = scope.length || 1
  return {
    done,
    total,
    pct: Math.round((done / total) * 100),
    lastLevel: scope[scope.length - 1]?.level ?? 'B1',
  }
}

/** Что ученик умеет после закрытия уровня — для баннера вехи. */
export const LEVEL_ACHIEVEMENT: Record<CefrLevel, string> = {
  A1: 'теперь вы ведёте простой бытовой разговор',
  A2: 'теперь вы свободно говорите о прошлом и планах',
  B1: 'теперь вы объясняете, спорите и строите сложные фразы',
  B2: 'вы владеете языком уверенно и в деталях',
}

/**
 * Первый непройденный юнит на стартовом уровне и выше (рекомендованный «дальше»).
 * Юниты ниже fromLevel пропускаются. Fallback — последний юнит каталога.
 */
export function nextUnit(
  doneIds: Set<string>,
  fromLevel?: CefrLevel,
): SyllabusUnit {
  const inScope = fromLevel
    ? SYLLABUS.filter((u) => !isBelowLevel(u, fromLevel))
    : SYLLABUS
  return (
    inScope.find((u) => !doneIds.has(u.id)) ??
    inScope[inScope.length - 1] ??
    SYLLABUS[SYLLABUS.length - 1]
  )
}
