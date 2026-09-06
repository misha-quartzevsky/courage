import type { CefrLevel, LearnerPersona, ProgressState } from '../lib/types'
import { consolidatedRuleIds, dueRules } from '../lib/storage'
import {
  courseProgress,
  nextSession,
  sessionByRuleId,
  type SyllabusSession,
} from '../lib/syllabus'
import {
  AlertIcon,
  ArrowRightIcon,
  BookIcon,
  FlameIcon,
  ReadIcon,
} from '../lib/icons'
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
  onStartReading: () => void
  onOpenCodex: () => void
  onEnough: () => void
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
  onStartReading,
  onOpenCodex,
  onEnough,
}: CockpitProps) {
  const doneR = consolidatedRuleIds(progress)
  const due = dueRules(progress)[0]
  const dueSess = due ? sessionByRuleId(due.ruleId) : undefined
  const ns = dueSess ?? nextSession(doneR, level)
  const cp = courseProgress(doneR, level)
  const nsRec = progress?.rules[ns.ruleId]
  // «Проверка» — выученное правило вернулось; «Закрепляем» — начатый дрилл;
  // иначе новое правило.
  const mode2 = due
    ? { eyebrow: 'Проверка', meta: 'быстрый круг — не осыпалось ли' }
    : nsRec?.drillRounds && !nsRec.learnedAt
      ? {
          eyebrow: 'Закрепляем',
          meta: `кругов пройдено: ${nsRec.drillRounds}`,
        }
      : { eyebrow: 'Новое правило', meta: '~1–2 мин на круг' }

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
              {streakDays} дн.
            </span>
          )}
          <button
            type="button"
            className="btn-icon"
            aria-label="Справочник"
            onClick={onOpenCodex}
          >
            <BookIcon />
          </button>
        </div>
      </header>

      <DayGrid days={progress?.studyDays ?? []} />

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
        <p className="eyebrow">{mode2.eyebrow}</p>
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
          <span>{mode2.meta}</span>
          {persona && <span>{persona.professionFr}</span>}
        </div>

        {ns.level !== 'A1' && (
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
        )}

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

      <div className="today-alt">
        <button type="button" className="btn btn-secondary" onClick={onStartReading}>
          <ReadIcon />
          Почитать
        </button>
        <button type="button" className="btn-text" onClick={onEnough}>
          Достаточно на сегодня
        </button>
      </div>

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

// Аддитивная история: дни текущего месяца, закрашены те, когда занималась.
// Без красного, без «сброса», пропущенный день просто не закрашен.
function DayGrid({ days }: { days: string[] }) {
  const set = new Set(days)
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const cells = Array.from({ length: daysInMonth }, (_, i) => {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
    return { key, on: set.has(key), today: key === todayKey }
  })
  const count = cells.filter((c) => c.on).length
  return (
    <div className="daygrid-wrap">
      <div className="daygrid" aria-hidden="true">
        {cells.map((c) => (
          <span
            key={c.key}
            className={`daygrid-cell${c.on ? ' daygrid-cell--on' : ''}${c.today ? ' daygrid-cell--today' : ''}`}
          />
        ))}
      </div>
      <p className="daygrid-cap muted">
        {count > 0 ? `${count} дн. в этом месяце` : 'Первый день месяца впереди'}
      </p>
    </div>
  )
}
