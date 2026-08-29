import type { CefrLevel, EvaluationVerdict, SprintSession } from '../lib/types'
import type { SyllabusUnit } from '../lib/syllabus'
import { speakFr } from '../lib/speech'
import { SpeakerIcon } from '../lib/icons'

interface DebriefProps {
  sprint: SprintSession
  verdicts: EvaluationVerdict[]
  milestone: { level: CefrLevel; text: string } | null
  next: SyllabusUnit | null
  onRetry: () => void
  onHome: () => void
}

export function Debrief({
  sprint,
  verdicts,
  milestone,
  next,
  onRetry,
  onHome,
}: DebriefProps) {
  const avg = verdicts.length
    ? Math.round(verdicts.reduce((a, v) => a + v.accuracy, 0) / verdicts.length)
    : 0
  const failedCount = verdicts.filter((v) => !v.passed).length

  const band = avg >= 80 ? 'ok' : avg >= 55 ? 'warn' : 'danger'
  const verdictWord =
    band === 'ok'
      ? 'Solide'
      : band === 'warn'
        ? 'En progrès'
        : 'À retravailler'
  const encouragement =
    band === 'ok'
      ? 'Тема уверенно закрыта — можно двигаться дальше.'
      : band === 'warn'
        ? 'Хороший прогресс. Ещё один заход закрепит.'
        : 'Нормально для начала — пройдите ещё раз, станет легче.'

  const allIssues = verdicts.flatMap((v) => v.issues)
  const allWords = verdicts.flatMap((v) => v.learnedWords)

  return (
    <main className="screen">
      <header>
        <p className="eyebrow">Bilan du sprint</p>
        <h1 className="screen-title">{sprint.unitTitleFr}</h1>
        <p className="muted">{sprint.level}</p>
      </header>

      {milestone && (
        <section className="card milestone">
          <p className="milestone-title">
            🎉 Parcours {milestone.level} terminé
          </p>
          <p className="muted">{milestone.text}</p>
        </section>
      )}

      <section className="card card-raised score-card">
        <div className={`score score--${band}`}>{avg}%</div>
        <div className="score-verdict">{verdictWord}</div>
        <p className="muted">{encouragement}</p>
        {verdicts.length > 0 && (
          <div className="dots" aria-hidden="true">
            {verdicts.map((v, i) => (
              <span
                key={i}
                className={`dot ${v.passed ? 'dot--pass' : 'dot--fail'}`}
              />
            ))}
          </div>
        )}
      </section>

      {allIssues.length > 0 && (
        <section className="card">
          <h2>À affiner</h2>
          <ul className="corrections">
            {allIssues.map((iss, i) => (
              <li key={i}>
                <span className="strike">{iss.snippet}</span>
                <span className="arrow">→</span>
                <strong>{iss.correctionFr}</strong>
                {iss.correctionRu && (
                  <span className="muted">{iss.correctionRu}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {allWords.length > 0 && (
        <section className="card">
          <h2>Mots du jour</h2>
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
                  <SpeakerIcon />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {next && (
        <p className="muted section-hint">
          À suivre — {next.level} · Unité {next.unit} : {next.titleFr}
        </p>
      )}

      <div className="spacer" />

      {failedCount > 0 ? (
        <>
          <button type="button" className="btn btn-lg" onClick={onRetry}>
            Corriger mes erreurs
          </button>
          <button type="button" className="btn btn-secondary" onClick={onHome}>
            Retour à l'accueil
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-lg" onClick={onHome}>
          Retour à l'accueil
        </button>
      )}
    </main>
  )
}
