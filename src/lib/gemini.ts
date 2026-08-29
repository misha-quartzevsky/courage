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
  if (
    !isStr(r.unitId) ||
    !isStr(r.unitTitleFr) ||
    !CEFR_LEVELS.includes(r.level as CefrLevel) ||
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
    unitId: r.unitId,
    unitTitleFr: r.unitTitleFr,
    level: r.level as CefrLevel,
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
// Deterministic fallback — одна функция на случай отсутствия
// ключа/сети/невалидного JSON от модели. Это не «фейк-гейтвей»,
// а гарантия прохождения спринта даже полностью оффлайн.
// TODO(debt): заменить на полноценный local-каталог юнитов Édito,
// когда оффлайн станет целью как таковой.
// ------------------------------------------------------------
const FALLBACK_UNITS = [
  {
    unitId: 'a1-u1-se-presenter',
    unitTitleFr: 'Se présenter au bloc / en réunion',
    situation: {
      titleFr: 'Faire connaissance',
      contextFr:
        'Вы знакомитесь с новой командой в клинике. Представьтесь и поддержите диалог.',
    },
  },
  {
    unitId: 'a1-u2-services-bancaires',
    unitTitleFr: 'Ouvrir un compte en banque',
    situation: {
      titleFr: 'À la banque',
      contextFr:
        'Вы открываете банковский счёт после переезда. Отвечайте сотруднику банка.',
    },
  },
]

export function getFallbackSprint(
  persona: LearnerPersona,
  level: CefrLevel,
  prevUnitId?: string,
): SprintSession {
  const baseIdx = FALLBACK_UNITS.findIndex((u) => u.unitId === prevUnitId)
  const unit = FALLBACK_UNITS[(baseIdx + 1) % FALLBACK_UNITS.length]
  const target = persona.domainTags[0] ?? 'votre métier'

  return {
    id: makeId(),
    unitId: unit.unitId,
    unitTitleFr: unit.unitTitleFr,
    level,
    durationMinutes: 5,
    situation: unit.situation,
    exercises: [
      {
        id: 'ex-1',
        promptFr: `Bonjour ! Je suis ${persona.professionFr}. Et vous ?`,
        promptRu: `Поздоровайтесь и представьтесь (${persona.label}). Спросите собеседника, как его зовут.`,
        expectedKeyPhrases: [
          'je m\'appelle',
          'je suis',
          'enchanté',
          'bonjour',
        ],
      },
      {
        id: 'ex-2',
        promptFr: `Parlez-moi de votre métier: qu'est-ce que vous faites exactement ?`,
        promptRu: `Расскажите о своей работе. Используйте термин «${target}» и добавьте, что это сложно, но вам нравится.`,
        expectedKeyPhrases: [
          'je fais',
          'je travaille',
          'c\'est difficile',
          'j\'aime',
        ],
      },
      {
        id: 'ex-3',
        promptFr: 'Avez-vous des loisirs ? Moi, je fais du ski alpin.',
        promptRu:
          'Ответьте про увлечения: вы тоже катаетесь на лыжах и занимаетесь кикбоксингом.',
        expectedKeyPhrases: ['je fais du ski', 'aussi', 'la boxe'],
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
  prevUnitId?: string,
): string {
  return [
    'Ты — дидакт французского по методу Édito (CEFR).',
    `Уровень ученика: ${level}.`,
    `Профиль: ${persona.professionFr}. Интересы: ${persona.interestsFr.join(', ')}.`,
    `Узкие термины: ${persona.domainTags.join(', ')}.`,
    prevUnitId
      ? `Предыдущий юнит: ${prevUnitId}. Выбери следующий логичный юнит.`
      : 'Это первый спринт — выбери юнит уровня начала.',
    '',
    'Правило 70/30: 70% — академическая база Édito (быт/реальная жизнь), 30% — контекст профиля.',
    'Запрещено выдумывать жаргон: только реальные термины из области пользователя.',
    '',
    'Сгенерируй спринт на 4–6 минут: ситуация + ровно 3 упражнения-реплики диалога.',
    'Верни ТОЛЬКО JSON без markdown-обёрток, по схеме:',
    '{',
    '  "unitId": "string, например a1-u1-se-presenter",',
    '  "unitTitleFr": "тема юнита по-французски",',
    '  "level": "' + level + '",',
    '  "durationMinutes": 5,',
    '  "situation": { "titleFr": "string", "contextFr": "string" },',
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
  prevUnitId?: string,
): Promise<SprintSession> {
  if (!WORKER_URL) {
    // TODO(debt): без адреса прокси — демо-спринт; рабочий AI-путь
    // включается после деплоя Worker'а и заполнения VITE_GEMINI_WORKER_URL.
    return getFallbackSprint(persona, level, prevUnitId)
  }

  let text: string
  try {
    text = await callGemini(buildSprintSystemPrompt(persona, level, prevUnitId), [
      { text: 'Сгенерируй спринт.' },
    ])
  } catch (err) {
    console.error('[gemini.sprint]', err)
    throw new Error('GEMINI_UNAVAILABLE')
  }

  const draft = sanitizeSprint(text)
  if (!draft) {
    // TODO(debt): модель вернула невалидный JSON — вместо тихой деградации
    // можно предложить «повторить запрос»; пока молча берём оффлайн-путь.
    return getFallbackSprint(persona, level, prevUnitId)
  }

  return { ...draft, id: makeId(), createdAt: new Date().toISOString() }
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