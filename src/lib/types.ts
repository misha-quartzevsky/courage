// Доменные типы Courage — один файл, нет слоёв.
// Объединяет сущности из ARCHITECTURE.md без искусственных папок-«слоёв».

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2'
export type ProfessionId = 'surgeon' | 'marketer'

// LearnerPersona — профиль пользователя. 30% персонализации спринта.
export interface LearnerPersona {
  id: ProfessionId
  label: string // «Витреоретинальный хирург» — для UI
  professionFr: string // для промпта
  interestsFr: string[]
  domainTags: string[] // узкие термины для промпта
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

// Прогресс для 3-дневного спринта (storage.ts).
export interface ProgressState {
  completedUnitIds: string[]
  streakDays: number
  bestAccuracy: number
  updatedAt: string
}