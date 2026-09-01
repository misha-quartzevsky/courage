// Прогресс ученика: история по юнитам, выученные слова, стрик, лучший балл.
// LocalStorage — источник для демо-режима и оффлайн-кэш; при наличии Supabase
// дублируется в profiles.progress (jsonb): { units, words }.

import type {
  CefrLevel,
  LearnedWord,
  ProgressState,
  RuleRecord,
  UnitRecord,
  WordRecord,
} from './types'
import { getRule } from './grammar'
import { SYLLABUS, unitById } from './syllabus'
import { updateProgress } from './supabase'

const KEY = 'courage:progress'
// Урок теперь даёт весь свой словарь (~15–30 слов), не 3 — поднимаем потолок.
const WORDS_CAP = 300

const EMPTY: ProgressState = {
  units: {},
  rules: {},
  words: [],
  streakDays: 0,
  bestAccuracy: 0,
  updatedAt: new Date(0).toISOString(),
}

interface LegacyProgress {
  completedUnitIds?: unknown
  streakDays?: unknown
  bestAccuracy?: unknown
  updatedAt?: unknown
}

function asUnits(v: unknown): Record<string, UnitRecord> {
  return v && typeof v === 'object' ? (v as Record<string, UnitRecord>) : {}
}

function asRules(v: unknown): Record<string, RuleRecord> {
  return v && typeof v === 'object' ? (v as Record<string, RuleRecord>) : {}
}

// Развернуть карту пройденных юнитов в записи по каждому их правилу.
// Используется миграцией и мержем с сервером (старый формат без rules).
function seedRulesFromUnits(
  units: Record<string, UnitRecord>,
): Record<string, RuleRecord> {
  const rules: Record<string, RuleRecord> = {}
  for (const [unitId, urec] of Object.entries(units)) {
    for (const ruleId of unitById(unitId)?.ruleIds ?? []) {
      rules[ruleId] = {
        ruleId,
        unitId,
        level: urec.level,
        titleFr: getRule(ruleId)?.titleFr ?? urec.titleFr,
        bestAccuracy: urec.bestAccuracy,
        attempts: urec.attempts,
        lastCompletedAt: urec.lastCompletedAt,
      }
    }
  }
  return rules
}

// Кэш-запись юнита: null, если пройдены не все его правила.
function deriveUnitRecord(
  unitId: string,
  rules: Record<string, RuleRecord>,
): UnitRecord | null {
  const unit = unitById(unitId)
  if (!unit) return null
  const recs = unit.ruleIds.map((id) => rules[id])
  if (recs.some((r) => !r)) return null
  const present = recs as RuleRecord[]
  return {
    unitId,
    level: unit.level,
    titleFr: unit.titleFr,
    bestAccuracy: Math.round(
      present.reduce((a, r) => a + r.bestAccuracy, 0) / present.length,
    ),
    attempts: Math.max(...present.map((r) => r.attempts)),
    lastCompletedAt: present
      .map((r) => r.lastCompletedAt)
      .reduce((a, b) => (a > b ? a : b)),
  }
}

// Пересобрать кэш units целиком из карты правил.
function rebuildUnits(
  rules: Record<string, RuleRecord>,
): Record<string, UnitRecord> {
  const units: Record<string, UnitRecord> = {}
  for (const u of SYLLABUS) {
    const rec = deriveUnitRecord(u.id, rules)
    if (rec) units[u.id] = rec
  }
  return units
}

// Порог «пройдено»: слово тускнеет в словаре, когда mastery дошёл до этого.
export const MASTERY_LEARNED = 2

export function isLearned(w: WordRecord): boolean {
  return (w.mastery ?? 0) >= MASTERY_LEARNED
}

function asWords(v: unknown): WordRecord[] {
  if (!Array.isArray(v)) return []
  return v
    .filter(
      (w): w is WordRecord =>
        !!w &&
        typeof w === 'object' &&
        typeof (w as WordRecord).fr === 'string' &&
        typeof (w as WordRecord).ru === 'string',
    )
    .map((w) => ({
      fr: w.fr,
      ru: w.ru,
      addedAt: typeof w.addedAt === 'string' ? w.addedAt : new Date(0).toISOString(),
      ...(typeof w.mastery === 'number' ? { mastery: w.mastery } : {}),
      ...(typeof w.lastSeenAt === 'string' ? { lastSeenAt: w.lastSeenAt } : {}),
    }))
}

// Слить два списка слов: дедуп по fr, слияние ПО ПОЛЯМ (mastery не сбрасывается
// при повторном добавлении слова), кап, сортировка по свежести.
function mergeWords(a: WordRecord[], b: WordRecord[]): WordRecord[] {
  const by = new Map<string, WordRecord>()
  for (const w of [...a, ...b]) {
    const key = w.fr.trim().toLowerCase()
    const cur = by.get(key)
    if (!cur) {
      by.set(key, w)
      continue
    }
    const seen = [cur.lastSeenAt, w.lastSeenAt].filter(Boolean).sort()
    by.set(key, {
      fr: cur.fr,
      ru: cur.ru || w.ru,
      addedAt: w.addedAt > cur.addedAt ? w.addedAt : cur.addedAt,
      ...(Math.max(cur.mastery ?? 0, w.mastery ?? 0) > 0
        ? { mastery: Math.max(cur.mastery ?? 0, w.mastery ?? 0) }
        : {}),
      ...(seen.length ? { lastSeenAt: seen[seen.length - 1] } : {}),
    })
  }
  return [...by.values()]
    .sort((x, y) => (x.addedAt < y.addedAt ? 1 : -1))
    .slice(0, WORDS_CAP)
}

function migrate(raw: unknown): ProgressState | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>

  const streakDays = typeof p.streakDays === 'number' ? p.streakDays : 0
  const bestAccuracy = typeof p.bestAccuracy === 'number' ? p.bestAccuracy : 0
  const updatedAt =
    typeof p.updatedAt === 'string' ? p.updatedAt : new Date().toISOString()

  // Новейший формат — есть карта rules.
  if (p.rules && typeof p.rules === 'object') {
    const rules = asRules(p.rules)
    return {
      units: asUnits(p.units),
      rules,
      words: asWords(p.words),
      streakDays,
      bestAccuracy,
      updatedAt,
    }
  }

  // Прежний формат: { units, words } без rules — сидируем правила из юнитов.
  if (p.units && typeof p.units === 'object') {
    const units = asUnits(p.units)
    return {
      units,
      rules: seedRulesFromUnits(units),
      words: asWords(p.words),
      streakDays,
      bestAccuracy,
      updatedAt,
    }
  }

  // Легаси: плоский список id.
  const legacy = raw as LegacyProgress
  if (Array.isArray(legacy.completedUnitIds)) {
    const units: Record<string, UnitRecord> = {}
    for (const id of legacy.completedUnitIds) {
      if (typeof id !== 'string') continue
      const u = unitById(id)
      units[id] = {
        unitId: id,
        level: u?.level ?? 'A1',
        titleFr: u?.titleFr ?? id,
        bestAccuracy: 0,
        attempts: 1,
        lastCompletedAt: updatedAt,
      }
    }
    return {
      units,
      rules: seedRulesFromUnits(units),
      words: [],
      streakDays,
      bestAccuracy,
      updatedAt,
    }
  }

  return null
}

export function loadProgress(): ProgressState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return migrate(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveProgress(progress: ProgressState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress))
  } catch {
    // Приватный режим Safari бросает QuotaExceeded — молча роняем.
  }
}

function nextStreak(prev: ProgressState | null, now: Date): number {
  if (!prev || prev.updatedAt === EMPTY.updatedAt) return 1
  const dayKey = (d: Date) => d.toISOString().slice(0, 10)
  const todayKey = dayKey(now)
  const prevKey = prev.updatedAt.slice(0, 10)
  if (prevKey === todayKey) return prev.streakDays
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  return prevKey === dayKey(yesterday) ? prev.streakDays + 1 : 1
}

interface SessionRef {
  ruleId: string
  unitId: string
  level: CefrLevel
  ruleTitleFr: string
}

// Записать прохождение сессии-практики: история правила, кэш юнита, слова, стрик.
// session === null — повторение (rules/units не трогаем, пишем только слова и стрик).
export function recordSessionCompletion(
  session: SessionRef | null,
  avgAccuracy: number,
  learnedWords: LearnedWord[] = [],
  masteredFr: string[] = [],
): ProgressState {
  const prev = loadProgress()
  const now = new Date()
  const nowIso = now.toISOString()

  // Слова, на которые ученик ответил верно в этой сессии — поднимаем им mastery.
  const masteredSet = new Set(masteredFr.map((s) => s.trim().toLowerCase()))
  const bumps: WordRecord[] = (prev?.words ?? [])
    .filter((w) => masteredSet.has(w.fr.trim().toLowerCase()))
    .map((w) => ({
      ...w,
      mastery: (w.mastery ?? 0) + 1,
      lastSeenAt: nowIso,
    }))

  const words = mergeWords(prev?.words ?? [], [
    ...learnedWords.map((w) => ({ fr: w.fr, ru: w.ru, addedAt: nowIso, mastery: 0 })),
    ...bumps,
  ])

  let rules = prev?.rules ?? {}
  let units = prev?.units ?? {}
  if (session) {
    const prevRule = rules[session.ruleId]
    rules = {
      ...rules,
      [session.ruleId]: {
        ruleId: session.ruleId,
        unitId: session.unitId,
        level: session.level,
        titleFr: session.ruleTitleFr || prevRule?.titleFr || session.ruleId,
        bestAccuracy: Math.max(prevRule?.bestAccuracy ?? 0, avgAccuracy),
        attempts: (prevRule?.attempts ?? 0) + 1,
        lastCompletedAt: nowIso,
      },
    }
    const derived = deriveUnitRecord(session.unitId, rules)
    units = { ...units }
    if (derived) units[session.unitId] = derived
    else delete units[session.unitId]
  }

  const next: ProgressState = {
    units,
    rules,
    words,
    streakDays: nextStreak(prev, now),
    bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, avgAccuracy),
    updatedAt: nowIso,
  }
  saveProgress(next)

  void updateProgress({
    streakDays: next.streakDays,
    bestAccuracy: next.bestAccuracy,
    lastCompletedAt: next.updatedAt,
    units: next.units,
    rules: next.rules,
    words: next.words,
  })

  return next
}

// Лёгкий режим (разминка без практики): держим стрик живым, ничего больше не трогаем.
export function recordLightSession(): ProgressState {
  const prev = loadProgress()
  const now = new Date()
  const next: ProgressState = {
    units: prev?.units ?? {},
    rules: prev?.rules ?? {},
    words: prev?.words ?? [],
    streakDays: nextStreak(prev, now),
    bestAccuracy: prev?.bestAccuracy ?? 0,
    updatedAt: now.toISOString(),
  }
  saveProgress(next)

  void updateProgress({
    streakDays: next.streakDays,
    bestAccuracy: next.bestAccuracy,
    lastCompletedAt: next.updatedAt,
    units: next.units,
    rules: next.rules,
    words: next.words,
  })

  return next
}

// Тап по слову в словаре: переключить «пройдено» ⇄ «не пройдено». Если слова
// ещё нет в прогрессе (тап по строке большого встроенного словаря) — добавить
// его сразу как «пройдено».
export function toggleWordLearned(fr: string, ru = ''): ProgressState {
  const prev = loadProgress() ?? EMPTY
  const nowIso = new Date().toISOString()
  const key = fr.trim().toLowerCase()
  const existing = prev.words.find((w) => w.fr.trim().toLowerCase() === key)

  let words: WordRecord[]
  if (!existing) {
    words = mergeWords(prev.words, [
      { fr: fr.trim(), ru, addedAt: nowIso, mastery: MASTERY_LEARNED, lastSeenAt: nowIso },
    ])
  } else {
    const nextMastery = isLearned(existing) ? 0 : MASTERY_LEARNED
    words = prev.words.map((w) =>
      w.fr.trim().toLowerCase() === key
        ? { ...w, mastery: nextMastery, lastSeenAt: nowIso }
        : w,
    )
  }

  // updatedAt НЕ трогаем — тап по словарю не считается учебной активностью
  // и не должен влиять на стрик.
  const next: ProgressState = { ...prev, words }
  saveProgress(next)
  void updateProgress({
    streakDays: next.streakDays,
    bestAccuracy: next.bestAccuracy,
    lastCompletedAt: next.updatedAt,
    units: next.units,
    rules: next.rules,
    words: next.words,
  })
  return next
}

// Мерж прогресса с сервера в локальный. serverProgress — { units, rules, words },
// прежний { units, words } или легаси-карта UnitRecord. Карта rules — источник
// истины; units после мержа целиком пересобирается из неё.
export function mergeServerProgress(
  serverProgress: unknown,
  serverStreak: number,
  serverBest: number,
): ProgressState {
  const local = loadProgress() ?? EMPTY

  const raw = (serverProgress ?? {}) as Record<string, unknown>
  const serverUnits =
    raw.units && typeof raw.units === 'object'
      ? asUnits(raw.units)
      : asUnits(serverProgress)
  const serverWords = asWords(raw.words)
  const serverRules =
    raw.rules && typeof raw.rules === 'object'
      ? asRules(raw.rules)
      : seedRulesFromUnits(serverUnits)

  const rules: Record<string, RuleRecord> = { ...local.rules }
  for (const [id, srv] of Object.entries(serverRules)) {
    const loc = rules[id]
    if (!loc || srv.lastCompletedAt > loc.lastCompletedAt) {
      rules[id] = { ...srv, bestAccuracy: Math.max(srv.bestAccuracy, loc?.bestAccuracy ?? 0) }
    } else {
      rules[id] = {
        ...loc,
        bestAccuracy: Math.max(srv.bestAccuracy, loc.bestAccuracy),
      }
    }
  }

  const merged: ProgressState = {
    units: rebuildUnits(rules),
    rules,
    words: mergeWords(local.words, serverWords),
    streakDays: Math.max(local.streakDays, serverStreak),
    bestAccuracy: Math.max(local.bestAccuracy, serverBest),
    updatedAt: new Date().toISOString(),
  }
  saveProgress(merged)
  return merged
}

// Множество пройденных unitId — для карты курса.
export function doneUnitIds(progress: ProgressState | null): Set<string> {
  return new Set(Object.keys(progress?.units ?? {}))
}

// Множество пройденных ruleId — для nextSession / courseProgress / карты курса.
export function doneRuleIds(progress: ProgressState | null): Set<string> {
  return new Set(Object.keys(progress?.rules ?? {}))
}

// Пройденные, но слабые правила (для Révision).
export function weakRules(progress: ProgressState | null): RuleRecord[] {
  return Object.values(progress?.rules ?? {})
    .filter((r) => r.bestAccuracy < 70)
    .sort((a, b) => a.bestAccuracy - b.bestAccuracy)
}
