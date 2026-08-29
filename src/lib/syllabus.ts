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

// Одна сессия = одно правило. Плоский список в курсовом порядке.
export interface SyllabusSession {
  ruleId: string
  unitId: string // 'a1-u3'
  level: CefrLevel
  unit: number // номер юнита
  indexInUnit: number // 1-based
  countInUnit: number
  ruleTitleFr: string
  ruleTitleRu: string
  unitTitleRu: string
}

const LEVEL_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2']

function levelIndex(l: CefrLevel): number {
  const i = LEVEL_ORDER.indexOf(l)
  return i === -1 ? 0 : i
}

/** true, если уровень ниже стартового уровня ученика. */
function levelBelow(level: CefrLevel, fromLevel?: CefrLevel): boolean {
  return fromLevel ? levelIndex(level) < levelIndex(fromLevel) : false
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

function buildSessions(): SyllabusSession[] {
  const byId = new Map(RULES.map((r) => [r.id, r]))
  const out: SyllabusSession[] = []
  for (const u of SYLLABUS) {
    u.ruleIds.forEach((ruleId, i) => {
      const rule = byId.get(ruleId)
      if (!rule) return
      out.push({
        ruleId,
        unitId: u.id,
        level: u.level,
        unit: u.unit,
        indexInUnit: i + 1,
        countInUnit: u.ruleIds.length,
        ruleTitleFr: rule.titleFr,
        ruleTitleRu: rule.titleRu,
        unitTitleRu: u.titleRu,
      })
    })
  }
  return out
}

/** Все сессии курса (level → unit → порядок правила в юните). */
export const SESSIONS: SyllabusSession[] = buildSessions()

const SESSION_BY_RULE = new Map(SESSIONS.map((s) => [s.ruleId, s]))

export function sessionByRuleId(id: string): SyllabusSession | undefined {
  return SESSION_BY_RULE.get(id)
}

export function sessionsForUnit(unitId: string): SyllabusSession[] {
  return SESSIONS.filter((s) => s.unitId === unitId)
}

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

/** Все правила всех юнитов уровня пройдены. */
export function levelComplete(
  level: CefrLevel,
  doneRuleIds: Set<string>,
): boolean {
  const sessions = SESSIONS.filter((s) => s.level === level)
  return sessions.length > 0 && sessions.every((s) => doneRuleIds.has(s.ruleId))
}

/** Прогресс по курсу (в правилах), начиная со стартового уровня ученика. */
export function courseProgress(
  doneRuleIds: Set<string>,
  fromLevel?: CefrLevel,
): { done: number; total: number; pct: number; lastLevel: CefrLevel } {
  const scope = SESSIONS.filter((s) => !levelBelow(s.level, fromLevel))
  const done = scope.filter((s) => doneRuleIds.has(s.ruleId)).length
  const total = scope.length || 1
  return {
    done,
    total,
    pct: Math.round((done / total) * 100),
    lastLevel: scope[scope.length - 1]?.level ?? 'B1',
  }
}

/** Прогресс по одному юниту: сколько правил пройдено из всех. */
export function unitProgress(
  unitId: string,
  doneRuleIds: Set<string>,
): { done: number; total: number } {
  const ruleIds = unitById(unitId)?.ruleIds ?? []
  return {
    done: ruleIds.filter((id) => doneRuleIds.has(id)).length,
    total: ruleIds.length,
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
 * Первая непройденная сессия (правило) на стартовом уровне и выше.
 * Уровни ниже fromLevel пропускаются. Fallback — последняя сессия каталога.
 */
export function nextSession(
  doneRuleIds: Set<string>,
  fromLevel?: CefrLevel,
): SyllabusSession {
  const inScope = fromLevel
    ? SESSIONS.filter((s) => !levelBelow(s.level, fromLevel))
    : SESSIONS
  return (
    inScope.find((s) => !doneRuleIds.has(s.ruleId)) ??
    inScope[inScope.length - 1] ??
    SESSIONS[SESSIONS.length - 1]
  )
}
