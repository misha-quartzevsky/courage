import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type {
  EvaluationVerdict,
  SprintExercise,
  SprintSession,
} from '../lib/types'
import { evaluateAnswer } from '../lib/gemini'
import { speakFr } from '../lib/speech'
import { useRecorder } from '../hooks/useRecorder'
import type { Mode } from './Cockpit'

interface SprintProps {
  sprint: SprintSession
  exercises: SprintExercise[]
  mode: Mode
  onFinish: (verdicts: EvaluationVerdict[]) => void
  onQuit: () => void
}

export function Sprint({ sprint, exercises, mode, onFinish, onQuit }: SprintProps) {
  const recorder = useRecorder()
  const [idx, setIdx] = useState(0)
  const [verdicts, setVerdicts] = useState<EvaluationVerdict[]>([])
  const [feedback, setFeedback] = useState<EvaluationVerdict | null>(null)
  const [evaluating, setEvaluating] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [serviceError, setServiceError] = useState<string | null>(null)

  const exercise = exercises[idx]
  const isLast = idx === exercises.length - 1

  // Автоозвучка ситуации при смене упражнения
  useEffect(() => {
    if (!exercise) return
    speakFr(exercise.promptFr)
  }, [exercise])

  const submitAnswer = useCallback(
    async (
      answer:
        | { type: 'voice'; audioBase64: string; mimeType: string }
        | { type: 'text'; text: string },
    ) => {
      if (!exercise) return
      setEvaluating(true)
      setServiceError(null)
      try {
        const v = await evaluateAnswer(sprint, exercise, answer)
        setFeedback(v)
        setVerdicts((prev) => [...prev, v])
      } catch {
        setServiceError(
          'Прокси-сервис недоступен: проверьте VITE_GEMINI_WORKER_URL и что Worker задеплоен.',
        )
      } finally {
        setEvaluating(false)
      }
    },
    [sprint, exercise],
  )

  const handleMicClick = () => {
    if (recorder.error) {
      setServiceError('Микрофон недоступен. Проверьте разрешения Safari.')
      return
    }
    if (recorder.isRecording) {
      void recorder.stop().then((audio) => {
        if (audio) {
          return submitAnswer({
            type: 'voice',
            audioBase64: audio.audioBase64,
            mimeType: audio.mimeType,
          })
        }
      })
    } else {
      void recorder.start()
    }
  }

  const handleTextSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!textInput.trim() || evaluating) return
    void submitAnswer({ type: 'text', text: textInput.trim() })
  }

  const handleNext = () => {
    if (isLast) {
      onFinish(verdicts)
      return
    }
    setIdx((i) => i + 1)
    setFeedback(null)
    setTextInput('')
  }

  if (!exercise) return null

  return (
    <main className="screen">
      <header className="topbar">
        <span className="muted">
          {sprint.unitTitleFr} · {idx + 1}/{exercises.length}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-tight"
          onClick={onQuit}
        >
          ✕ Выйти
        </button>
      </header>

      <section className="card situation">
        <p className="serif dialogue">{exercise.promptFr}</p>
        <button
          type="button"
          className="btn-icon"
          aria-label="Озвучить ситуацию"
          onClick={() => speakFr(exercise.promptFr)}
        >
          🔊
        </button>
        <p className="muted">{exercise.promptRu}</p>
      </section>

      {feedback ? (
        <section className="card feedback">
          <div className="feedback-row">
            <span className={feedback.passed ? 'ok' : 'warn'}>
              {feedback.passed ? '✓ Верно' : '• Есть что поправить'}
            </span>
            <span>Точность {feedback.accuracy}%</span>
            <span>Беглость {feedback.fluency}%</span>
          </div>
          <p className="serif">«{feedback.transcript}»</p>
          <p>{feedback.feedbackRu}</p>

          {feedback.issues.length > 0 && (
            <ul className="issues">
              {feedback.issues.map((iss, i) => (
                <li key={i}>
                  <span className="strike">{iss.snippet}</span>
                  <span> → </span>
                  <strong>{iss.correctionFr}</strong>
                  {iss.correctionRu && (
                    <span className="muted"> — {iss.correctionRu}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {feedback.learnedWords.length > 0 && (
            <div className="learned">
              {feedback.learnedWords.map((w, i) => (
                <button
                  key={i}
                  type="button"
                  className="chip"
                  onClick={() => speakFr(w.fr)}
                >
                  {w.fr} <span className="muted">{w.ru}</span>
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className="btn"
            disabled={evaluating}
            onClick={handleNext}
          >
            {isLast ? 'Завершить спринт' : 'Следующее упражнение'}
          </button>
        </section>
      ) : (
        <section className="answer-area">
          {mode === 'voice' ? (
            <div className="voice-area">
              <div className="wave" aria-hidden="true">
                {Array.from({ length: 28 }, (_, i) => (
                  <span
                    key={i}
                    className="wave-bar"
                    style={{
                      transform: `scaleY(${
                        0.25 +
                        recorder.audioLevel * (0.35 + (0.65 * (i % 5)) / 4)
                      })`,
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                className={`mic-btn${recorder.isRecording ? ' mic-btn--live' : ''}`}
                disabled={evaluating}
                onClick={handleMicClick}
              >
                {recorder.isRecording
                  ? '⏹ Остановить'
                  : evaluating
                    ? 'Оцениваем…'
                    : '🎙 Говорите'}
              </button>
              <p className="muted">
                {recorder.isRecording
                  ? 'Говорите — волна реагирует на голос'
                  : 'Нажмите и отвечайте голосом'}
              </p>
            </div>
          ) : (
            <form className="text-form" onSubmit={handleTextSubmit}>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Ваш ответ по-французски…"
                rows={3}
                autoFocus
              />
              <button
                type="submit"
                className="btn"
                disabled={!textInput.trim() || evaluating}
              >
                {evaluating ? 'Оцениваем…' : 'Проверить'}
              </button>
            </form>
          )}
        </section>
      )}

      {serviceError && <p className="error">{serviceError}</p>}
      {recorder.error && <p className="error">{recorder.error}</p>}
    </main>
  )
}