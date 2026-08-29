// ============================================================
// Глубокий модуль Gemini: простая внешняя поверхность
// (generateSprint / evaluateAnswer), сложная начинка внутри:
// промпт-инжиниринг 70/30, вызов REST, санитизация JSON,
// деградация на детерминированный оффлайн-спринт.
// ============================================================

import type {
  CefrLevel,
  EvaluationVerdict,
  LearnerPersona,
  SprintDraft,
  SprintExercise,
  SprintSession,
  VerdictDraft,
} from './types'
import type { SyllabusUnit } from './syllabus'
import { rulesForUnit, type GrammarRule } from './grammar'

// Транспорт: запросы идут через Cloudflare Worker-прокси (ключ — секрет
// Worker'а, фронтенд его не видит). Без VITE_GEMINI_WORKER_URL — демо-режим.
const WORKER_URL = (
  import.meta.env.VITE_GEMINI_WORKER_URL as string | undefined
)?.replace(/\/+$/, '')
// Модель через алиас *-latest: конкретные версии (1.5/2.0/2.5) сняты с API.
const MODEL = 'gemini-flash-lite-latest'
const ENDPOINT = `${WORKER_URL}/v1beta/models/${MODEL}:generateContent`

// ------------------------------------------------------------
// Низкоуровневый вызов REST
// ------------------------------------------------------------
type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }

interface GeminiApiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

async function callGemini(
  systemPrompt: string,
  parts: GeminiPart[],
): Promise<string> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    }),
  })

  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`)
  }

  const data = (await res.json()) as GeminiApiResponse
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')
    .trim()

  if (!text) throw new Error('Gemini: пустой ответ')
  return text
}

// ------------------------------------------------------------
// Санитизация — то, что реально ломается молча (EXP-001)
// ------------------------------------------------------------
function extractJson(text: string): unknown | null {
  const trimmed = text.trim()

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      /* пробуем обёртки ниже */
    }
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim())
    } catch {
      /* пробуем голый объект */
    }
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      return null
    }
  }
  return null
}

const CEFR_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2']

function isStr(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function clampScore(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 50
  return Math.min(100, Math.max(0, Math.round(v)))
}

function strArr(v: unknown): string[] | null {
  return Array.isArray(v) && v.every(isStr) ? (v as string[]) : null
}

// Разбор одного упражнения по kind. Невалидное — null (отбрасывается).
function parseExercise(e: unknown, i: number): SprintExercise | null {
  if (!e || typeof e !== 'object') return null
  const x = e as Record<string, unknown>
  const id = isStr(x.id) ? x.id : `ex-${i + 1}`
  if (!isStr(x.promptRu)) return null
  const base = { id, promptRu: x.promptRu }

  switch (x.kind) {
    case 'dialogue': {
      const keys = strArr(x.expectedKeyPhrases)
      if (!isStr(x.promptFr) || !keys) return null
      return { ...base, kind: 'dialogue', promptFr: x.promptFr, expectedKeyPhrases: keys }
    }
    case 'gap': {
      if (!isStr(x.textFr) || !Array.isArray(x.blanks)) return null
      const blanks: { answer: string; alts?: string[] }[] = []
      for (const b of x.blanks) {
        const bo = b as Record<string, unknown>
        if (!isStr(bo.answer)) return null
        const alts = strArr(bo.alts)
        blanks.push(alts ? { answer: bo.answer, alts } : { answer: bo.answer })
      }
      const holes = (x.textFr.match(/\{\}/g) ?? []).length
      if (blanks.length === 0 || blanks.length !== holes) return null
      return { ...base, kind: 'gap', textFr: x.textFr, blanks }
    }
    case 'choice': {
      const options = strArr(x.options)
      if (!isStr(x.promptFr) || !options || options.length < 2) return null
      const ai = x.answerIndex
      if (typeof ai !== 'number' || ai < 0 || ai >= options.length) return null
      return { ...base, kind: 'choice', promptFr: x.promptFr, options, answerIndex: Math.round(ai) }
    }
    case 'order': {
      const tokens = strArr(x.tokens)
      if (!tokens || tokens.length < 2 || !isStr(x.answer)) return null
      return { ...base, kind: 'order', tokens, answer: x.answer }
    }
    case 'transform': {
      if (!isStr(x.sourceFr) || !isStr(x.answer)) return null
      return {
        ...base,
        kind: 'transform',
        sourceFr: x.sourceFr,
        answer: x.answer,
        alts: strArr(x.alts) ?? undefined,
      }
    }
    case 'match': {
      if (!Array.isArray(x.pairs)) return null
      const pairs = x.pairs
        .map((p) => {
          const po = p as Record<string, unknown>
          return isStr(po.fr) && isStr(po.ru) ? { fr: po.fr, ru: po.ru } : null
        })
        .filter((p): p is { fr: string; ru: string } => p !== null)
      if (pairs.length < 2 || pairs.length > 5) return null
      return { ...base, kind: 'match', pairs }
    }
    default:
      return null
  }
}

export function sanitizeSprint(text: string): SprintDraft | null {
  const raw = extractJson(text)
  if (!raw || typeof raw !== 'object') return null

  const r = raw as Record<string, unknown>
  // unitId / unitTitleFr больше не спрашиваем у модели — их ставит вызывающий
  // код из каталога (syllabus.ts). Если модель их всё же прислала — примем.
  if (
    typeof r.durationMinutes !== 'number' ||
    !(r.situation && typeof r.situation === 'object') ||
    !Array.isArray(r.exercises) ||
    r.exercises.length === 0
  ) {
    return null
  }

  const sit = r.situation as Record<string, unknown>
  if (!isStr(sit.titleFr) || !isStr(sit.contextFr)) return null

  const exercises = r.exercises
    .map((e, i) => parseExercise(e, i))
    .filter((e): e is SprintExercise => e !== null)

  if (exercises.length < 3) return null

  return {
    unitId: isStr(r.unitId) ? r.unitId : '',
    unitTitleFr: isStr(r.unitTitleFr) ? r.unitTitleFr : '',
    level: CEFR_LEVELS.includes(r.level as CefrLevel)
      ? (r.level as CefrLevel)
      : 'A1',
    durationMinutes: Math.min(10, Math.max(1, Math.round(r.durationMinutes))),
    situation: { titleFr: sit.titleFr, contextFr: sit.contextFr },
    exercises,
  }
}

export function sanitizeVerdict(text: string): VerdictDraft | null {
  const raw = extractJson(text)
  if (!raw || typeof raw !== 'object') return null

  const r = raw as Record<string, unknown>
  if (
    !Array.isArray(r.issues) ||
    !Array.isArray(r.learnedWords) ||
    !isStr(r.feedbackFr) ||
    !isStr(r.feedbackRu)
  ) {
    return null
  }

  const issues = r.issues
    .map((i) => {
      const it = i as Record<string, unknown>
      if (!isStr(it.snippet) || !isStr(it.correctionFr)) return null
      return {
        snippet: it.snippet,
        correctionFr: it.correctionFr,
        correctionRu: isStr(it.correctionRu) ? it.correctionRu : '',
      }
    })
    .filter((i): i is NonNullable<typeof i> => i !== null)

  const learnedWords = r.learnedWords
    .map((w) => {
      const wd = w as Record<string, unknown>
      if (!isStr(wd.fr) || !isStr(wd.ru)) return null
      return { fr: wd.fr, ru: wd.ru }
    })
    .filter((w): w is NonNullable<typeof w> => w !== null)

  return {
    transcript: isStr(r.transcript) ? r.transcript : '',
    accuracy: clampScore(r.accuracy),
    fluency: clampScore(r.fluency),
    passed: typeof r.passed === 'boolean' ? r.passed : clampScore(r.accuracy) >= 70,
    issues,
    learnedWords,
    feedbackFr: r.feedbackFr,
    feedbackRu: r.feedbackRu,
  }
}

// ------------------------------------------------------------
// Deterministic fallback — гарантия прохождения спринта даже полностью
// оффлайн / при невалидном JSON. Юнит берётся из каталога (syllabus.ts),
// упражнения — шаблонные под тему и контекст пользователя.
// ------------------------------------------------------------
const TOKEN_RE = /[\s'’]+/

// Детерминированные упражнения из данных правил юнита. Не «фейк-гейтвей», а
// гарантия 6 заданий разных типов даже оффлайн / при битом ответе модели.
export function fallbackExercises(
  persona: LearnerPersona,
  unit: SyllabusUnit,
): SprintExercise[] {
  const rules = rulesForUnit(unit.ruleIds)
  const examples = rules.flatMap((r) => r.examples)
  const target = persona.domainTags[0] ?? 'votre métier'
  const out: SprintExercise[] = []

  out.push({
    id: 'fb-d1',
    kind: 'dialogue',
    promptFr: `Bonjour ! Je suis ${persona.professionFr}. Et vous, que faites-vous ?`,
    promptRu: 'Поздоровайтесь, представьтесь и скажите, кем работаете.',
    expectedKeyPhrases: ['je suis', "je m'appelle", 'enchanté', 'bonjour'],
  })
  out.push({
    id: 'fb-d2',
    kind: 'dialogue',
    promptFr: `Parlez-moi de votre métier : qu'est-ce que vous faites exactement ?`,
    promptRu: `Расскажите о работе, используйте слово «${target}».`,
    expectedKeyPhrases: ['je fais', 'je travaille', "c'est", "j'aime"],
  })

  // gap — из первого примера: спрятать самое длинное слово.
  const ex0 = examples[0]
  if (ex0) {
    const words = ex0.fr.split(TOKEN_RE).filter(Boolean)
    const hidden = [...words].sort((a, b) => b.length - a.length)[0]
    if (hidden && words.length > 2) {
      out.push({
        id: 'fb-gap',
        kind: 'gap',
        promptRu: `Вставьте пропущенное слово. Перевод: ${ex0.ru}`,
        textFr: ex0.fr.replace(hidden, '{}'),
        blanks: [{ answer: hidden.replace(/[.,!?;:]$/, '') }],
      })
    }
  }

  // order — из второго примера (или первого).
  const exOrd = examples[1] ?? examples[0]
  if (exOrd) {
    const toks = exOrd.fr
      .replace(/[.!?]$/, '')
      .split(TOKEN_RE)
      .filter(Boolean)
    if (toks.length >= 3 && toks.length <= 8) {
      out.push({
        id: 'fb-order',
        kind: 'order',
        promptRu: `Соберите фразу. Перевод: ${exOrd.ru}`,
        tokens: [...toks].sort(() => Math.random() - 0.5),
        answer: exOrd.fr.replace(/[.!?]$/, ''),
      })
    }
  }

  // match — из первых пар примеров.
  const pairSrc = examples.slice(0, 3)
  if (pairSrc.length >= 2) {
    out.push({
      id: 'fb-match',
      kind: 'match',
      promptRu: 'Соедините французскую фразу с переводом.',
      pairs: pairSrc.map((e) => ({ fr: e.fr, ru: e.ru })),
    })
  }

  // choice — из key_exceptions или запасной.
  const exc = rules.flatMap((r) => Object.entries(r.keyExceptions))[0]
  out.push({
    id: 'fb-choice',
    kind: 'choice',
    promptRu: exc
      ? `Что верно про «${exc[0]}»?`
      : 'Выберите грамматически верную фразу.',
    promptFr: exc ? exc[0] : 'Je ___ étudiant.',
    options: exc
      ? [exc[1].slice(0, 80), 'Такого правила нет', 'Всегда без изменений']
      : ['suis', 'ai', 'est'],
    answerIndex: 0,
  })

  return out
}

export function getFallbackSprint(
  persona: LearnerPersona,
  level: CefrLevel,
  unit: SyllabusUnit,
): SprintSession {
  return {
    id: makeId(),
    unitId: unit.id,
    unitTitleFr: unit.titleFr,
    level,
    durationMinutes: 5,
    situation: {
      titleFr: unit.titleFr,
      contextFr: `Отработка темы «${unit.titleRu}». Отвечайте по-французски.`,
    },
    exercises: fallbackExercises(persona, unit).slice(0, 6),
    createdAt: new Date().toISOString(),
  }
}

function ruleDigest(rules: GrammarRule[]): string {
  return rules
    .map((r) => {
      const exc = Object.entries(r.keyExceptions)
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ')
      const ex = r.examples
        .slice(0, 2)
        .map((e) => `«${e.fr}» — ${e.ru}`)
        .join(' / ')
      return [
        `• ${r.titleFr} (${r.titleRu}).`,
        `  Суть: ${r.summaryRu}`,
        `  Образование: ${r.formationRule.replace(/\n+/g, ' ')}`,
        exc ? `  Исключения: ${exc}` : '',
        `  Примеры: ${ex}`,
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

// ------------------------------------------------------------
// Промпт-инжиниринг: 70% база Édito + 30% персонализация
// ------------------------------------------------------------
function buildSprintSystemPrompt(
  persona: LearnerPersona,
  level: CefrLevel,
  unit: SyllabusUnit,
): string {
  const digest = ruleDigest(rulesForUnit(unit.ruleIds))
  return [
    'Ты — дидакт французского по методу Édito (CEFR).',
    `Уровень ученика: ${level}.`,
    `Профиль: ${persona.professionFr}. Интересы: ${persona.interestsFr.join(', ')}.`,
    `Узкие термины: ${persona.domainTags.join(', ')}.`,
    `Юнит Édito: ${unit.id} — «${unit.titleFr}» (${unit.titleRu}).`,
    '',
    'ПРАВИЛА ЮНИТА (упражнения должны отрабатывать именно их):',
    digest,
    '',
    'Правило 70/30: 70% — база Édito (быт/реальная жизнь), 30% — контекст профиля.',
    'Только реальная лексика, без выдуманного жаргона.',
    '',
    'Сгенерируй РОВНО 6 упражнений РАЗНЫХ типов на эту грамматику. Не более 2 подряд',
    `одного типа. ${level === 'A1' ? 'Больше выбора и пропусков.' : ''}`,
    persona && 'Диалоговых (kind:"dialogue") — 2 штуки.',
    '',
    'Верни ТОЛЬКО JSON без markdown, по схеме (у каждого упражнения свой kind):',
    '{',
    '  "durationMinutes": 5,',
    '  "situation": { "titleFr": "string", "contextFr": "string на русском" },',
    '  "exercises": [',
    '    { "kind":"dialogue", "id":"e1", "promptRu":"что ответить", "promptFr":"реплика собеседника", "expectedKeyPhrases":["ориентиры"] },',
    '    { "kind":"gap", "id":"e2", "promptRu":"инструкция", "textFr":"Je {} à Paris et il {} ici.", "blanks":[{"answer":"vais","alts":[]},{"answer":"vit"}] },',
    '    { "kind":"choice", "id":"e3", "promptRu":"вопрос", "promptFr":"Il ___ parti hier.", "options":["a","est","ont"], "answerIndex":1 },',
    '    { "kind":"order", "id":"e4", "promptRu":"соберите фразу (перевод)", "tokens":["ski","du","fais","je"], "answer":"Je fais du ski" },',
    '    { "kind":"transform", "id":"e5", "promptRu":"поставьте в passé composé", "sourceFr":"Je mange une pomme.", "answer":"J\'ai mangé une pomme.", "alts":[] },',
    '    { "kind":"match", "id":"e6", "promptRu":"соедините фразу с переводом", "pairs":[{"fr":"la boxe","ru":"бокс"},{"fr":"le ski","ru":"лыжи"}] }',
    '  ]',
    '}',
    'В "textFr" для gap число "{}" = длине "blanks". Для order "tokens" — перемешанные слова "answer".',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildVerdictSystemPrompt(
  sprint: SprintSession,
  exercise: Extract<SprintExercise, { kind: 'dialogue' }>,
): string {
  return [
    'Ты — преподаватель французского. Оцени ответ ученика на одно упражнение спринта.',
    `Спринт: ${sprint.unitTitleFr} (${sprint.level}).`,
    `Упражнение: «${exercise.promptFr}».`,
    `Корректные фразы-ориентиры: ${exercise.expectedKeyPhrases.join('; ')}.`,
    '',
    'Верни ТОЛЬКО JSON без markdown-обёрток:',
    '{',
    '  "transcript": "что сказал/ввёл ученик как есть",',
    '  "accuracy": число 0-100,',
    '  "fluency": число 0-100,',
    '  "passed": true/false,',
    '  "issues": [ { "snippet": "неверный фрагмент", "correctionFr": "как правильно", "correctionRu": "почему" } ],',
    '  "learnedWords": [ { "fr": "слово", "ru": "перевод" } ],',
    '  "feedbackFr": "короткий ободряющий комментарий на французском",',
    '  "feedbackRu": "то же по-русски"',
    '}',
    '',
    'Мягкая коррекция: при мелких ошибках не «проваливай» — passed true, issues с исправлением.',
  ].join('\n')
}

// ------------------------------------------------------------
// Публичный API модуля
// ------------------------------------------------------------
export async function generateSprint(
  persona: LearnerPersona,
  level: CefrLevel,
  unit: SyllabusUnit,
): Promise<SprintSession> {
  if (!WORKER_URL) {
    // Без адреса прокси — детерминированный демо-спринт по выбранному юниту.
    return getFallbackSprint(persona, level, unit)
  }

  let text: string
  try {
    text = await callGemini(buildSprintSystemPrompt(persona, level, unit), [
      { text: 'Сгенерируй спринт.' },
    ])
  } catch (err) {
    console.error('[gemini.sprint]', err)
    throw new Error('GEMINI_UNAVAILABLE')
  }

  const draft = sanitizeSprint(text)
  if (!draft) return getFallbackSprint(persona, level, unit)

  // Добираем до 6 упражнений из детерминированного пула (если модель дала меньше).
  let exercises = draft.exercises
  if (exercises.length < 6) {
    const have = new Set(exercises.map((e) => e.kind))
    for (const fb of fallbackExercises(persona, unit)) {
      if (exercises.length >= 6) break
      if (!have.has(fb.kind) || exercises.length < 4) {
        exercises = [...exercises, fb]
        have.add(fb.kind)
      }
    }
  }
  exercises = exercises.slice(0, 6)

  // unitId / unitTitleFr / level — из каталога, не из ответа модели.
  return {
    ...draft,
    exercises,
    unitId: unit.id,
    unitTitleFr: unit.titleFr,
    level,
    id: makeId(),
    createdAt: new Date().toISOString(),
  }
}

// ------------------------------------------------------------
// Онбординг: свободный текст → структурированный контекст ученика
// ------------------------------------------------------------
export interface PersonaExtract {
  professionFr: string
  interestsFr: string[]
  domainTags: string[]
}

function sanitizePersona(text: string): PersonaExtract | null {
  const raw = extractJson(text)
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isStr(r.professionFr)) return null
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter(isStr).slice(0, 6) : []
  return {
    professionFr: r.professionFr.trim(),
    interestsFr: arr(r.interestsFr),
    domainTags: arr(r.domainTags),
  }
}

function fallbackPersona(text: string): PersonaExtract {
  const parts = text
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    professionFr: parts[0] ?? text.trim().slice(0, 80),
    interestsFr: parts.slice(1, 4),
    domainTags: [],
  }
}

export async function extractPersona(text: string): Promise<PersonaExtract> {
  const clean = text.trim()
  if (!clean) throw new Error('EMPTY_INPUT')
  if (!WORKER_URL) return fallbackPersona(clean)

  let out: string
  try {
    out = await callGemini(
      [
        'Ты помогаешь настроить контекст ученика французского.',
        'Из текста пользователя извлеки:',
        '- professionFr: профессия одной фразой по-французски;',
        '- interestsFr: 2–5 интересов/хобби по-французски (существительные);',
        '- domainTags: 3–6 узких профессиональных терминов по-французски.',
        'Только реальные слова, без выдуманного жаргона.',
        'Верни ТОЛЬКО JSON: {"professionFr":"...","interestsFr":["..."],"domainTags":["..."]}',
      ].join('\n'),
      [{ text: clean }],
    )
  } catch (err) {
    console.error('[gemini.persona]', err)
    return fallbackPersona(clean)
  }

  return sanitizePersona(out) ?? fallbackPersona(clean)
}

export async function evaluateAnswer(
  sprint: SprintSession,
  exercise: Extract<SprintExercise, { kind: 'dialogue' }>,
  answer:
    | { type: 'voice'; audioBase64: string; mimeType: string }
    | { type: 'text'; text: string },
): Promise<EvaluationVerdict> {
  if (!WORKER_URL) {
    // TODO(debt): оффлайн-оценка (совпадение ключевых фраз) — для полноценного
    // демо-режима; сейчас без прокси оценивать нечем.
    throw new Error('GEMINI_UNAVAILABLE')
  }

  const parts: GeminiPart[] =
    answer.type === 'voice'
      ? [
          {
            inlineData: { mimeType: answer.mimeType, data: answer.audioBase64 },
          },
          { text: 'Оцени распознанную речь.' },
        ]
      : [{ text: `Транскрипт ответа: ${answer.text}` }]

  let text: string
  try {
    text = await callGemini(buildVerdictSystemPrompt(sprint, exercise), parts)
  } catch (err) {
    console.error('[gemini.verdict]', err)
    throw new Error('GEMINI_UNAVAILABLE')
  }

  const draft = sanitizeVerdict(text)
  if (!draft) throw new Error('GEMINI_INVALID_JSON')

  return { ...draft, exerciseId: exercise.id }
}