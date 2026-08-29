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

// SprintExercise — одно задание внутри спринта.
export interface SprintExercise {
  id: string
  promptFr: string // ситуация/реплика на французском
  promptRu: string // контекст по-русски — пользователь знает, что ответить
  expectedKeyPhrases: string[] // фразы, которые модель считает корректными
}

// SprintSession — aggregate root из ARCHITECTURE.md.
export interface SprintSession {
  id: string
  unitId: string // например 'a1-u1-se-presenter'
  unitTitleFr: string
  level: CefrLevel
  durationMinutes: number
  situation: {
    titleFr: string
    contextFr: string
  }
  exercises: SprintExercise[]
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
export interface UnitRecord {
  unitId: string
  level: CefrLevel
  titleFr: string
  bestAccuracy: number
  attempts: number
  lastCompletedAt: string
}

// Прогресс ученика (storage.ts + Supabase profiles.progress).
export interface ProgressState {
  units: Record<string, UnitRecord>
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
  progress: Record<string, UnitRecord> | null
  target_level: CefrLevel | null
  streak_count: number
  best_accuracy: number
  last_completed_at: string | null
  partner_id: string | null
  created_at: string
  updated_at: string
}