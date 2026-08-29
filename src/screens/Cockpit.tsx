import type { CefrLevel, LearnerPersona, ProgressState } from '../lib/types'
import { doneUnitIds } from '../lib/storage'
import { nextUnit, type SyllabusUnit } from '../lib/syllabus'
import { AlertIcon, ArrowRightIcon, FlameIcon, GearIcon } from '../lib/icons'
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
  onStartUnit: (u: SyllabusUnit) => void
  onOpenSettings: () => void
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
  onStartUnit,
  onOpenSettings,
}: CockpitProps) {
  const next = nextUnit(doneUnitIds(progress))

  return (
    <main className="screen">
      <header className="topbar">
        <h1 className="app-title">
          Courage{userName ? ` · ${userName}` : ''}
        </h1>
        <div className="topbar-actions">
          {streakDays > 0 && (
            <span className="badge badge-flame">
              <FlameIcon />
              {streakDays} j
            </span>
          )}
          <button
            type="button"
            className="btn-icon"
            aria-label="Настройки"
            onClick={onOpenSettings}
          >
            <GearIcon />
          </button>
        </div>
      </header>

      {partnerStreak !== null && (
        <div className="partner-row">
          <span className="avatar">
            {partnerName ? partnerName.trim().charAt(0).toUpperCase() : '·'}
          </span>
          <span>
            {partnerName ? `${partnerName} · ` : 'Партнёр · '}
            {partnerStreak} jour{partnerStreak > 1 ? 's' : ''} de suite
          </span>
        </div>
      )}

      <section className="card card-raised preview">
        <p className="eyebrow">Prochaine leçon</p>
        <p className="preview-line">
          <span className="preview-unit">
            {next.level} · Unité {next.unit}
          </span>
          {next.titleFr}
        </p>
        <div className="preview-meta">
          <span>3 упражнения · 4–6 мин</span>
          {persona && <span>{persona.professionFr}</span>}
        </div>

        <div className="mode-toggle">
          <button
            type="button"
            className={mode === 'voice' ? 'seg seg--active' : 'seg'}
            onClick={() => onMode('voice')}
          >
            Voix
          </button>
          <button
            type="button"
            className={mode === 'text' ? 'seg seg--active' : 'seg'}
            onClick={() => onMode('text')}
          >
            Silencieux
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
          {loading ? 'On prépare…' : 'Commencer'}
          {!loading && <ArrowRightIcon />}
        </button>
      </section>

      <p className="muted section-hint">
        Уровень {level}. Любой юнит можно пройти или повторить — нажмите на него.
      </p>

      <CourseMap progress={progress} onStartUnit={onStartUnit} />
    </main>
  )
}
