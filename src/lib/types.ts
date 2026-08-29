// Доменные типы Courage — один файл, нет слоёв.
// Объединяет сущности из ARCHITECTURE.md без искусственных папок-«слоёв».

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2'
export type ProfessionId = 'surgeon' | 'marketer'

// LearnerPersona — личный контекст ученика (30% персонализации спринта).
// Собирается из профиля Supabase или из демо-дефолта.
export interface LearnerPersona {
  professionFr: string // для промпта, напр. «chirurgien vitréo-rétinien»
  interestsFr: string[] // 2–5 интересов
  domainTags: string[] // 3–6 узких терминов
}

// SprintExercise — одно задание внутри спринта. Размеченное объединение по kind.
// dialogue судит Gemini (и только он умеет голос); остальные проверяются локально.
interface ExerciseCommon {
  id: string
  promptRu: string // что нужно сделать, по-русски
}

export type SprintExercise =
  | (ExerciseCommon & {
      kind: 'dialogue'
      promptFr: string // реплика собеседника
      expectedKeyPhrases: string[]
    })
  | (ExerciseCommon & {
      kind: 'gap'
      textFr: string // с плейсхолдерами {} по числу blanks
      blanks: { answer: string; alts?: string[] }[]
    })
  | (ExerciseCommon & {
      kind: 'choice'
      promptFr: string
      options: string[]
      answerIndex: number
    })
  | (ExerciseCommon & {
      kind: 'order'
      tokens: string[] // слова в перемешанном порядке
      answer: string // правильная фраза целиком
    })
  | (ExerciseCommon & {
      kind: 'transform'
      sourceFr: string // исходная фраза
      answer: string
      alts?: string[]
    })
  | (ExerciseCommon & {
      kind: 'match'
      pairs: { fr: string; ru: string }[] // 2–5 пар, справа перемешиваются
    })

export type ExerciseKind = SprintExercise['kind']

// SprintSession — aggregate root из ARCHITECTURE.md.
export interface SprintSession {
  id: string
  unitId: string // например 'a1-u1'; 'revision' для повторения
  unitTitleFr: string
  ruleId: string // правило-фокус сессии; '' для повторения
  ruleTitleFr: string // '' для повторения
  level: CefrLevel
  durationMinutes: number
  situation: {
    titleFr: string
    contextFr: string
  }
  exercises: SprintExercise[]
  revision?: boolean // повторение — не двигает курсовой прогресс
  createdAt: string
}

export type SprintDraft = Omit<SprintSession, 'id' | 'createdAt'>

// EvaluationVerdict — вердикт по одному ответу (мягкая коррекция + Debrief).
export interface GrammarIssue {
  snippet: string // что было сказано неверно
  correctionFr: string // как правильно
  correctionRu: string // почему
}

export interface LearnedWord {
  fr: string
  ru: string
}

export interface EvaluationVerdict {
  exerciseId: string
  transcript: string // распознанная речь или введённый текст
  accuracy: number // 0..100
  fluency: number // 0..100
  passed: boolean
  issues: GrammarIssue[]
  learnedWords: LearnedWord[]
  feedbackFr: string
  feedbackRu: string
}

export type VerdictDraft = Omit<EvaluationVerdict, 'exerciseId'>

// Прогресс по одному юниту курса (история прохождений).
// Теперь ПРОИЗВОДНАЯ величина: агрегат по правилам юнита (см. deriveUnitRecord).
export interface UnitRecord {
  unitId: string
  level: CefrLevel
  titleFr: string
  bestAccuracy: number
  attempts: number
  lastCompletedAt: string
}

// Прогресс по одному правилу (сессии). Источник истины для курсового прогресса.
export interface RuleRecord {
  ruleId: string // 'a1-u1-verbes-etre-avoir'
  unitId: string // 'a1-u1'
  level: CefrLevel
  titleFr: string // rule.titleFr — чтобы Revision/Debrief не лезли в каталог
  bestAccuracy: number // max по попыткам
  attempts: number
  lastCompletedAt: string
}

// Выученное слово (для спринта Révision).
export interface WordRecord {
  fr: string
  ru: string
  addedAt: string
}

// Прогресс ученика (storage.ts + Supabase profiles.progress).
export interface ProgressState {
  units: Record<string, UnitRecord> // кэш: только полностью пройденные юниты (произв. от rules)
  rules: Record<string, RuleRecord> // источник истины, ключ = ruleId
  words: WordRecord[]
  streakDays: number
  bestAccuracy: number
  updatedAt: string
}

// Строка таблицы profiles в Supabase (RLS: своя + партнёр).
export interface SupabaseProfile {
  id: string
  user_id: string
  display_name: string | null
  profession: ProfessionId | null // легаси-enum, больше не пишется
  profession_text: string | null // свободный ввод из онбординга
  interests: string[] | null
  domain_tags: string[] | null
  progress: unknown // { units, rules, words } или легаси { units, words } / карта UnitRecord
  target_level: CefrLevel | null
  streak_count: number
  best_accuracy: number
  last_completed_at: string | null
  reminder_hour: number | null // локальный час ежедневного пуш-напоминания (0–23)
  last_notified_on: string | null // дата последнего отправленного пуша (YYYY-MM-DD)
  partner_id: string | null
  created_at: string
  updated_at: string
}