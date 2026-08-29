import type { SyllabusUnit } from '../lib/syllabus'
import { rulesForUnit } from '../lib/grammar'
import { RuleCard } from './RuleCard'
import { AlertIcon, ArrowRightIcon, CloseIcon } from '../lib/icons'

interface LessonIntroProps {
  unit: SyllabusUnit
  loading: boolean
  error: boolean
  onStart: () => void
  onSkip: () => void
  onClose: () => void
}

// Введение в тему перед практикой: разбор правил юнита из справочника.
export function LessonIntro({
  unit,
  loading,
  error,
  onStart,
  onSkip,
  onClose,
}: LessonIntroProps) {
  const rules = rulesForUnit(unit.ruleIds)

  return (
    <main className="screen">
      <header className="topbar">
        <p className="eyebrow">
          {unit.level} · Юнит {unit.unit}
        </p>
        <button
          type="button"
          className="btn btn-secondary btn-tight"
          onClick={onClose}
        >
          <CloseIcon />
          Назад
        </button>
      </header>

      <h1 className="screen-title">{unit.titleRu}</h1>
      <p className="muted serif">{unit.titleFr}</p>

      {rules.length === 0 && (
        <p className="muted">Для этого юнита нет разбора — сразу к практике.</p>
      )}

      {rules.map((rule) => (
        <RuleCard key={rule.id} rule={rule} />
      ))}

      {error && (
        <p className="error">
          <AlertIcon />
          Не удалось собрать упражнения. Попробуйте ещё раз.
        </p>
      )}

      <div className="spacer" />

      <button
        type="button"
        className="btn btn-lg"
        disabled={loading}
        onClick={onStart}
      >
        {loading ? 'Готовим упражнения…' : 'Начать практику'}
        {!loading && <ArrowRightIcon />}
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={loading}
        onClick={onSkip}
      >
        Пропустить разбор
      </button>
    </main>
  )
}
