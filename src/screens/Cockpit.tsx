import type { CefrLevel, LearnerPersona, ProgressState } from '../lib/types'
import { doneRuleIds } from '../lib/storage'
import { courseProgress, nextSession, type SyllabusSession } from '../lib/syllabus'
import { AlertIcon, ArrowRightIcon, FlameIcon } from '../lib/icons'
import { CourseMap } from './CourseMap'

export type Mode = 'voice' | 'text'

interface CockpitProps {
  persona: LearnerPersona | null
  level: CefrLevel
  mode: Mode
  loading: boolean
  error: boolean
  streakDays: number
  partnerStreak: number | null
  partnerName: string | null
  userName: string | null
  progress: ProgressState | null
  onMode: (m: Mode) => void
  onStartNext: () => void
  onOpenSession: (s: SyllabusSession) => void
}

export function Cockpit({
  persona,
  level,
  mode,
  loading,
  error,
  streakDays,
  partnerStreak,
  partnerName,
  userName,
  progress,
  onMode,
  onStartNext,
  onOpenSession,
}: CockpitProps) {
  const doneR = doneRuleIds(progress)
  const ns = nextSession(doneR, level)
  const cp = courseProgress(doneR, level)

  return (
    <main className="screen">
      <header className="topbar">
        <h1 className="app-title">
          Courage{userName ? ` · ${userName}` : ''}
        </h1>
        {streakDays > 0 && (
          <span className="badge badge-flame">
            <FlameIcon />
            {streakDays} дн.
          </span>
        )}
      </header>

      {partnerStreak !== null && (
        <div className="partner-row">
          <span className="avatar">
            {partnerName ? partnerName.trim().charAt(0).toUpperCase() : '·'}
          </span>
          <span>
            {partnerName ? `${partnerName} · ` : 'Партнёр · '}
            {partnerStreak} дн. подряд
          </span>
        </div>
      )}

      <div className="course-progress">
        <div className="course-progress-head">
          <span>
            {cp.done} / {cp.total} правил
          </span>
          <span className="muted">{cp.pct}% пути до {cp.lastLevel}</span>
        </div>
        <div className="course-progress-bar" aria-hidden="true">
          <span style={{ width: `${cp.pct}%` }} />
        </div>
      </div>

      <section className="card card-raised preview">
        <p className="eyebrow">Следующая сессия</p>
        <p className="preview-line">
          <span className="preview-unit">
            {ns.level} · Юнит {ns.unit}
          </span>
          {ns.ruleTitleRu}
          <span className="preview-sub">{ns.ruleTitleFr}</span>
        </p>
        <p className="muted preview-progress">
          Правило {ns.indexInUnit} из {ns.countInUnit} · {ns.unitTitleRu}
        </p>
        <div className="preview-meta">
          <span>~4 упражнения · 2–3 мин</span>
          {persona && <span>{persona.professionFr}</span>}
        </div>

        <div className="mode-toggle">
          <button
            type="button"
            className={mode === 'voice' ? 'seg seg--active' : 'seg'}
            onClick={() => onMode('voice')}
          >
            Голос
          </button>
          <button
            type="button"
            className={mode === 'text' ? 'seg seg--active' : 'seg'}
            onClick={() => onMode('text')}
          >
            Текст
          </button>
        </div>

        {error && (
          <p className="error">
            <AlertIcon />
            Не удалось собрать спринт. Проверьте соединение и попробуйте ещё раз.
          </p>
        )}

        <button
          type="button"
          className="btn btn-lg"
          disabled={loading || !persona}
          onClick={onStartNext}
        >
          {loading ? 'Готовим…' : 'Начать'}
          {!loading && <ArrowRightIcon />}
        </button>
      </section>

      <p className="muted section-hint">
        Ваш уровень — {level}. Юнит можно раскрыть и пройти по одному правилу — нажмите на него.
      </p>

      <CourseMap
        progress={progress}
        level={level}
        onOpenSession={onOpenSession}
      />
    </main>
  )
}
