import type { ProgressState, RuleRecord } from '../lib/types'
import { weakRules } from '../lib/storage'
import { AlertIcon, RefreshIcon } from '../lib/icons'

// Русское склонение по числу: 1 слово, 2 слова, 5 слов.
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

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
              {words.length} {plural(words.length, 'слово', 'слова', 'слов')} на повторение
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
            {words.length > 0
              ? `Пока рано — ещё ${8 - words.length} ${plural(8 - words.length, 'слово', 'слова', 'слов')}, и здесь появится повторение.`
              : 'Пока нечего повторять — пройдите пару юнитов, и здесь появятся слова и слабые темы.'}
          </p>
        </section>
      )}
    </main>
  )
}
