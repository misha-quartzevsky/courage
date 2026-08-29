import type { EvaluationVerdict, SprintSession } from '../lib/types'
import { speakFr } from '../lib/speech'

interface DebriefProps {
  sprint: SprintSession
  verdicts: EvaluationVerdict[]
  onRetry: () => void
  onHome: () => void
}

export function Debrief({ sprint, verdicts, onRetry, onHome }: DebriefProps) {
  const avg = verdicts.length
    ? Math.round(verdicts.reduce((a, v) => a + v.accuracy, 0) / verdicts.length)
    : 0
  const failedCount = verdicts.filter((v) => !v.passed).length

  const allIssues = verdicts.flatMap((v) =>
    v.issues.map((iss) => ({
      ...iss,
      exerciseId: v.exerciseId,
    })),
  )
  const allWords = verdicts.flatMap((v) => v.learnedWords)

  return (
    <main className="screen">
      <header>
        <h1 className="app-title">Bilan du sprint</h1>
        <p className="muted">
          {sprint.unitTitleFr} · {sprint.level}
        </p>
      </header>

      <section className="card score-card">
        <div className="score">{avg}%</div>
        <p className="muted">Средняя точность · {verdicts.length} ответов</p>
      </section>

      {allIssues.length > 0 && (
        <section className="card">
          <h2>Разбор ошибок</h2>
          {allIssues.map((iss, i) => (
            <div className="issue-block" key={i}>
              <p className="serif strike">«{iss.snippet}»</p>
              <p>
                <strong>{iss.correctionFr}</strong>
                {iss.correctionRu && (
                  <span className="muted"> — {iss.correctionRu}</span>
                )}
              </p>
            </div>
          ))}
        </section>
      )}

      {allWords.length > 0 && (
        <section className="card">
          <h2>Слова на сегодня</h2>
          <ul className="words">
            {allWords.map((w, i) => (
              <li key={i}>
                <span className="serif">{w.fr}</span>
                <span className="muted">{w.ru}</span>
                <button
                  type="button"
                  className="btn-icon"
                  aria-label={`Озвучить ${w.fr}`}
                  onClick={() => speakFr(w.fr)}
                >
                  🔊
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {failedCount > 0 && (
        <button type="button" className="btn" onClick={onRetry}>
          Recommencer et corriger
        </button>
      )}

      <button
        type="button"
        className="btn btn-secondary"
        onClick={onHome}
      >
        Retour à l'accueil
      </button>
    </main>
  )
}