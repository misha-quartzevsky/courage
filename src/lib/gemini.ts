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
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
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
    .map((e) => {
      const ex = e as Record<string, unknown>
      if (
        !isStr(ex.id) ||
        !isStr(ex.promptFr) ||
        !isStr(ex.promptRu) ||
        !Array.isArray(ex.expectedKeyPhrases) ||
        !(ex.expectedKeyPhrases as unknown[]).every(isStr)
      ) {
        return null
      }
      return {
        id: ex.id,
        promptFr: ex.promptFr,
        promptRu: ex.promptRu,
        expectedKeyPhrases: ex.expectedKeyPhrases as string[],
      } satisfies SprintExercise
    })
    .filter((e): e is SprintExercise => e !== null)

  if (exercises.length === 0) return null

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
export function getFallbackSprint(
  persona: LearnerPersona,
  level: CefrLevel,
  unit: SyllabusUnit,
): SprintSession {
  const target = persona.domainTags[0] ?? 'votre métier'
  const hobby = persona.interestsFr[0] ?? 'le sport'

  return {
    id: makeId(),
    unitId: unit.id,
    unitTitleFr: unit.titleFr,
    level,
    durationMinutes: 5,
    situation: {
      titleFr: unit.titleFr,
      contextFr: `Отработка темы «${unit.titleRu}» в бытовом диалоге. Отвечайте собеседнику по-французски.`,
    },
    exercises: [
      {
        id: 'ex-1',
        promptFr: `Bonjour ! Je suis ${persona.professionFr}. Et vous, que faites-vous ?`,
        promptRu:
          'Поздоровайтесь, представьтесь и коротко скажите, кем работаете.',
        expectedKeyPhrases: ['je m\'appelle', 'je suis', 'enchanté', 'bonjour'],
      },
      {
        id: 'ex-2',
        promptFr: `Parlez-moi de votre métier : qu'est-ce que vous faites exactement ?`,
        promptRu: `Расскажите о работе. Используйте термин «${target}» и добавьте, что это сложно, но вам нравится.`,
        expectedKeyPhrases: ['je fais', 'je travaille', 'c\'est difficile', 'j\'aime'],
      },
      {
        id: 'ex-3',
        promptFr: `Avez-vous des loisirs ? Moi, j'aime ${hobby}.`,
        promptRu: `Ответьте про увлечения: упомяните «${hobby}» и ещё одно занятие.`,
        expectedKeyPhrases: ['je fais', 'aussi', 'j\'aime'],
      },
    ],
    createdAt: new Date().toISOString(),
  }
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
  return [
    'Ты — дидакт французского по методу Édito (CEFR).',
    `Уровень ученика: ${level}.`,
    `Профиль: ${persona.professionFr}. Интересы: ${persona.interestsFr.join(', ')}.`,
    `Узкие термины: ${persona.domainTags.join(', ')}.`,
    `Юнит Édito: ${unit.id} — «${unit.titleFr}» (${unit.titleRu}).`,
    'Построй бытовую ситуацию, в которой эта грамматическая тема реально нужна.',
    '',
    'Правило 70/30: 70% — академическая база Édito (быт/реальная жизнь), 30% — контекст профиля.',
    'Запрещено выдумывать жаргон: только реальные термины из области пользователя.',
    '',
    'Сгенерируй спринт на 4–6 минут: ситуация + ровно 3 упражнения-реплики диалога.',
    'unitId и unitTitleFr не указывай — их подставит система.',
    'Верни ТОЛЬКО JSON без markdown-обёрток, по схеме:',
    '{',
    '  "durationMinutes": 5,',
    '  "situation": { "titleFr": "string", "contextFr": "string на русском — что от ученика хотят" },',
    '  "exercises": [',
    '    {',
    '      "id": "ex-1",',
    '      "promptFr": "реплика собеседника на французском",',
    '      "promptRu": "то же по-русски: что от пользователя хотят услышать",',
    '      "expectedKeyPhrases": ["фразы-кандидаты корректного ответа"]',
    '    }',
    '  ]',
    '}',
  ].join('\n')
}

function buildVerdictSystemPrompt(
  sprint: SprintSession,
  exercise: SprintExercise,
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

  // unitId / unitTitleFr / level — из каталога, не из ответа модели.
  return {
    ...draft,
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
  exercise: SprintExercise,
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