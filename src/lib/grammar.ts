// Единый источник грамматики Édito (A1–B1).
// Источник — grammar-rules-A1-A2-B1.json. Здесь читаются ВСЕ поля правила;
// syllabus.ts берёт отсюда же облегчённый срез для каталога юнитов.

import rawRules from '../../grammar-rules-A1-A2-B1.json'
import type { CefrLevel } from './types'

export interface GrammarRule {
  id: string
  level: CefrLevel
  unit: number
  category: 'Grammaire' | 'Conjugaison'
  titleFr: string
  titleRu: string
  summaryRu: string
  triggers: string[] // может быть []
  formationRule: string // может содержать \n
  keyExceptions: Record<string, string> // может быть {}
  examples: { fr: string; ru: string }[] // всегда 2–3
}

interface RawRule {
  id: string
  level: string
  unit: number
  category: string
  title_fr: string
  title_ru: string
  summary_ru: string
  triggers: unknown
  formation_rule: string
  key_exceptions: unknown
  authentic_examples: unknown
}

function toExamples(v: unknown): { fr: string; ru: string }[] {
  if (!Array.isArray(v)) return []
  return v
    .filter(
      (e): e is { fr: string; ru: string } =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as { fr?: unknown }).fr === 'string' &&
        typeof (e as { ru?: unknown }).ru === 'string',
    )
    .map((e) => ({ fr: e.fr, ru: e.ru }))
}

function toExceptions(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val
  }
  return out
}

export const RULES: GrammarRule[] = (rawRules as RawRule[]).map((r) => ({
  id: r.id,
  level: r.level.toUpperCase() as CefrLevel,
  unit: r.unit,
  category: r.category === 'Conjugaison' ? 'Conjugaison' : 'Grammaire',
  titleFr: r.title_fr,
  titleRu: r.title_ru,
  summaryRu: r.summary_ru,
  triggers: Array.isArray(r.triggers)
    ? r.triggers.filter((t): t is string => typeof t === 'string')
    : [],
  formationRule: r.formation_rule,
  keyExceptions: toExceptions(r.key_exceptions),
  examples: toExamples(r.authentic_examples),
}))

const BY_ID = new Map(RULES.map((r) => [r.id, r]))

export function getRule(id: string): GrammarRule | undefined {
  return BY_ID.get(id)
}

export function rulesForUnit(ruleIds: string[]): GrammarRule[] {
  return ruleIds
    .map((id) => BY_ID.get(id))
    .filter((r): r is GrammarRule => r !== undefined)
}

export function searchRules(query: string): GrammarRule[] {
  const q = query.trim().toLowerCase()
  if (!q) return RULES
  return RULES.filter((r) => {
    const hay = [
      r.titleFr,
      r.titleRu,
      r.summaryRu,
      r.triggers.join(' '),
    ]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}
