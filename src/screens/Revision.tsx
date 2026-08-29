import type { ProgressState, RuleRecord } from '../lib/types'
import { weakRules } from '../lib/storage'
import { AlertIcon, RefreshIcon } from '../lib/icons'

interface RevisionProps {
  progress: ProgressState | null
  loading: boolean
  error: boolean
  onStart: () => void
}

export function Revision({ progress, loading, error, onStart }: RevisionProps) {
  const words = progress?.words ?? []
  const weak: RuleRecord | undefined = weakRules(progress)[0]
  const ready = words.length >= 8 || !!weak

  return (
    <main className="screen">
      <header>
        <p className="eyebrow">Тренажёр</p>
        <h1 className="screen-title serif">Повторение</h1>
        <p className="muted">
          Возвращаемся к выученным словам и темам, где были ошибки. Курсовой
          прогресс это не двигает.
        </p>
      </header>

      {ready ? (
        <>
          <section className="card card-raised">
            <p className="preview-line">
              {words.length} слов{words.length % 10 === 1 && words.length !== 11 ? 'о' : ''} на повторение
            </p>
            {weak && (
              <p className="muted">
                Слабая тема: {weak.titleFr} — {weak.bestAccuracy}%
              </p>
            )}
          </section>

          {error && (
            <p className="error">
              <AlertIcon />
              Не удалось собрать повторение. Попробуйте ещё раз.
            </p>
          )}

          <div className="spacer" />

          <button
            type="button"
            className="btn btn-lg"
            disabled={loading}
            onClick={onStart}
          >
            <RefreshIcon />
            {loading ? 'Готовим…' : 'Начать повторение'}
          </button>
        </>
      ) : (
        <section className="card">
          <p className="muted">
            Пока нечего повторять — пройдите пару юнитов, и здесь появятся
            слова и слабые темы.
          </p>
        </section>
      )}
    </main>
  )
}
