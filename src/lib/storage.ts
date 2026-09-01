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
// Словарь — источник расписания SRS: выученное не должно молча выпадать по
// свежести, иначе интервальные повторения теряют смысл. Потолок держим только
// как предохранитель от разрастания localStorage (двое учеников за годы столько
// не наберут).
const WORDS_CAP = 5000

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

// Ручной порог «пройдено»: тап по слову в словаре ставит mastery на это значение.
export const MASTERY_LEARNED = 2

// Растущие интервалы повторения в днях: верный ответ двигает слово на шаг вперёд,
// ошибка — сбрасывает к первому. «Расширяющиеся интервалы» из sla-methods.md.
export const SRS_STEPS = [1, 3, 7, 16, 35]
// Слово считается «пройденным», когда доросло по SRS до интервала ~в месяц.
export const SRS_LEARNED_INTERVAL = 30

export function isLearned(w: WordRecord): boolean {
  return (
    (w.interval ?? 0) >= SRS_LEARNED_INTERVAL || (w.mastery ?? 0) >= MASTERY_LEARNED
  )
}

function addDays(fromIso: string, days: number): string {
  const d = new Date(fromIso)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

// Следующий шаг интервала после верного ответа (в конце шкалы — стоим на месте).
function nextInterval(prev: number | undefined): number {
  const cur = prev ?? 0
  return SRS_STEPS.find((s) => s > cur) ?? SRS_STEPS[SRS_STEPS.length - 1]
}

// Когда слову снова пора на повторение. dueAt в прошлом (или не задан у легаси /
// только что добавленного слова) — просрочено. Ручную пометку «пройдено» без
// расписания не трогаем: она уходит в далёкое будущее.
function dueAtMs(w: WordRecord): number {
  if (w.dueAt) return Date.parse(w.dueAt)
  if (isLearned(w)) return Number.POSITIVE_INFINITY
  // Легаси-слово без расписания: считаем просроченным с момента добавления.
  return Date.parse(w.addedAt) || 0
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
      ...(typeof w.interval === 'number' ? { interval: w.interval } : {}),
      ...(typeof w.dueAt === 'string' ? { dueAt: w.dueAt } : {}),
      ...(typeof w.ruleId === 'string' && w.ruleId ? { ruleId: w.ruleId } : {}),
      ...(typeof w.exampleFr === 'string' && typeof w.exampleRu === 'string' && w.exampleFr && w.exampleRu
        ? { exampleFr: w.exampleFr, exampleRu: w.exampleRu }
        : {}),
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
    // Расписание SRS берём из записи, которую видели позже (у неё актуальнее
    // interval/dueAt); если у той его нет — из второй.
    const fresher =
      (w.lastSeenAt ?? w.addedAt) >= (cur.lastSeenAt ?? cur.addedAt) ? w : cur
    const staler = fresher === w ? cur : w
    const interval = fresher.interval ?? staler.interval
    const dueAt = fresher.interval != null ? fresher.dueAt : fresher.dueAt ?? staler.dueAt
    by.set(key, {
      fr: cur.fr,
      ru: cur.ru || w.ru,
      addedAt: w.addedAt > cur.addedAt ? w.addedAt : cur.addedAt,
      ...(Math.max(cur.mastery ?? 0, w.mastery ?? 0) > 0
        ? { mastery: Math.max(cur.mastery ?? 0, w.mastery ?? 0) }
        : {}),
      ...(seen.length ? { lastSeenAt: seen[seen.length - 1] } : {}),
      ...(interval != null ? { interval } : {}),
      ...(dueAt ? { dueAt } : {}),
      // Тему проставляем один раз — первое непустое значение побеждает.
      ...(cur.ruleId || w.ruleId ? { ruleId: cur.ruleId || w.ruleId } : {}),
      // Пример-предложение: первое непустое; дополняем, если раньше не было.
      ...(cur.exampleFr && cur.exampleRu
        ? { exampleFr: cur.exampleFr, exampleRu: cur.exampleRu }
        : w.exampleFr && w.exampleRu
          ? { exampleFr: w.exampleFr, exampleRu: w.exampleRu }
          : {}),
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
  missedFr: string[] = [],
): ProgressState {
  const prev = loadProgress()
  const now = new Date()
  const nowIso = now.toISOString()

  // SRS-переоценка слов, затронутых в этой сессии:
  //  • верный ответ — интервал на шаг вперёд, dueAt = now + новый интервал;
  //  • ошибка       — интервал сброшен к первому шагу (dueAt = завтра).
  // Ошибка приоритетнее верного ответа по тому же слову.
  const missedSet = new Set(missedFr.map((s) => s.trim().toLowerCase()))
  const masteredSet = new Set(masteredFr.map((s) => s.trim().toLowerCase()))
  const bumps: WordRecord[] = (prev?.words ?? [])
    .filter((w) => {
      const k = w.fr.trim().toLowerCase()
      return missedSet.has(k) || masteredSet.has(k)
    })
    .map((w) => {
      const k = w.fr.trim().toLowerCase()
      if (missedSet.has(k)) {
        return { ...w, interval: SRS_STEPS[0], dueAt: addDays(nowIso, SRS_STEPS[0]), lastSeenAt: nowIso }
      }
      const interval = nextInterval(w.interval)
      return {
        ...w,
        interval,
        dueAt: addDays(nowIso, interval),
        mastery: (w.mastery ?? 0) + 1,
        lastSeenAt: nowIso,
      }
    })

  const words = mergeWords(prev?.words ?? [], [
    // Новые слова урока входят в SRS: первое повторение — на следующий день.
    // Тему берём из правила-фокуса сессии (у повторения session=null — без темы).
    ...learnedWords.map((w) => ({
      fr: w.fr,
      ru: w.ru,
      addedAt: nowIso,
      mastery: 0,
      interval: 0,
      dueAt: addDays(nowIso, 1),
      ...(session?.ruleId ? { ruleId: session.ruleId } : {}),
      ...(w.exampleFr && w.exampleRu
        ? { exampleFr: w.exampleFr, exampleRu: w.exampleRu }
        : {}),
    })),
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

  // «Пройдено» вручную = увести из очереди SRS в далёкое будущее; «не пройдено»
  // = вернуть в очередь (просрочено с завтра).
  const asLearned = {
    mastery: MASTERY_LEARNED,
    interval: SRS_LEARNED_INTERVAL,
    dueAt: addDays(nowIso, SRS_LEARNED_INTERVAL),
    lastSeenAt: nowIso,
  }
  const asUnlearned = {
    mastery: 0,
    interval: 0,
    dueAt: addDays(nowIso, 1),
    lastSeenAt: nowIso,
  }

  let words: WordRecord[]
  if (!existing) {
    words = mergeWords(prev.words, [{ fr: fr.trim(), ru, addedAt: nowIso, ...asLearned }])
  } else {
    const patch = isLearned(existing) ? asUnlearned : asLearned
    words = prev.words.map((w) =>
      w.fr.trim().toLowerCase() === key
        ? { ...w, ...patch }
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

// Собрать слова в тематические блоки: слова одного ruleId идут подряд, блоки —
// в порядке самого просроченного слова внутри. Лексику повторяем блоками по
// теме, а не вперемешку (sla-methods.md). Вход уже отсортирован по сроку.
function groupByTheme(words: WordRecord[]): WordRecord[] {
  const blocks = new Map<string, WordRecord[]>()
  for (const w of words) {
    const key = w.ruleId ?? ''
    const b = blocks.get(key)
    if (b) b.push(w)
    else blocks.set(key, [w])
  }
  return [...blocks.values()]
    .sort((a, b) => dueAtMs(a[0]) - dueAtMs(b[0]))
    .flat()
}

// Слова, которым пора на повторение: dueAt в прошлом (просроченные / легаси /
// только добавленные), сгруппированы в тематические блоки, блоки — по срочности.
// Если просроченного меньше `min` — добираем ближайшие по dueAt, чтобы подходу
// было чем занять. Ручную пометку «пройдено» без SRS-расписания не поднимаем.
export function dueWords(
  progress: ProgressState | null,
  now: Date = new Date(),
  min = 12,
): WordRecord[] {
  const t = now.getTime()
  const words = [...(progress?.words ?? [])].sort((a, b) => dueAtMs(a) - dueAtMs(b))
  const overdue = groupByTheme(words.filter((w) => dueAtMs(w) <= t))
  if (overdue.length >= min) return overdue
  const upcoming = words.filter((w) => {
    const d = dueAtMs(w)
    return d > t && d !== Number.POSITIVE_INFINITY
  })
  return [...overdue, ...groupByTheme(upcoming).slice(0, min - overdue.length)]
}

// Сколько слов просрочено на данный момент (для текста пуш-напоминания).
export function dueWordCount(progress: ProgressState | null, now: Date = new Date()): number {
  const t = now.getTime()
  return (progress?.words ?? []).filter((w) => dueAtMs(w) <= t).length
}

// Пройденные, но слабые правила (для Révision).
export function weakRules(progress: ProgressState | null): RuleRecord[] {
  return Object.values(progress?.rules ?? {})
    .filter((r) => r.bestAccuracy < 70)
    .sort((a, b) => a.bestAccuracy - b.bestAccuracy)
}

// Ранее пройденные правила, которые стоит «вплести» в спринт нового правила
// (interleaving из sla-methods.md). Приоритет — слабые (bestAccuracy < 70),
// самые слабые первыми; если их не хватает — добираем давно не повторявшиеся.
export function interleaveRules(
  progress: ProgressState | null,
  excludeRuleId: string,
  n = 2,
): RuleRecord[] {
  const done = Object.values(progress?.rules ?? {}).filter(
    (r) => r.ruleId !== excludeRuleId,
  )
  const weak = done
    .filter((r) => r.bestAccuracy < 70)
    .sort((a, b) => a.bestAccuracy - b.bestAccuracy)
  if (weak.length >= n) return weak.slice(0, n)
  const rest = done
    .filter((r) => r.bestAccuracy >= 70)
    .sort((a, b) => a.lastCompletedAt.localeCompare(b.lastCompletedAt))
  return [...weak, ...rest].slice(0, n)
}
