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
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  CloseIcon,
  MicIcon,
  SpeakerIcon,
  StopIcon,
} from '../lib/icons'

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
      } catch (err) {
        console.error('evaluateAnswer failed', err)
        setServiceError(
          'Не удалось проверить ответ. Проверьте соединение и попробуйте ещё раз.',
        )
      } finally {
        setEvaluating(false)
      }
    },
    [sprint, exercise],
  )

  const handleMicClick = () => {
    if (recorder.error) {
      setServiceError('Нет доступа к микрофону. Разрешите его в настройках браузера.')
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
        <div className="progress" aria-label={`Упражнение ${idx + 1} из ${exercises.length}`}>
          {exercises.map((ex, i) => (
            <span
              key={ex.id}
              className={`progress-seg${
                i < idx ? ' progress-seg--done' : i === idx ? ' progress-seg--current' : ''
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-tight"
          onClick={onQuit}
        >
          <CloseIcon />
          Quitter
        </button>
      </header>

      <section className="card card-raised situation">
        <button
          type="button"
          className="btn-icon"
          aria-label="Озвучить ситуацию"
          onClick={() => speakFr(exercise.promptFr)}
        >
          <SpeakerIcon />
        </button>
        <p className="dialogue">{exercise.promptFr}</p>
        <p className="muted">{exercise.promptRu}</p>
      </section>

      {feedback ? (
        <section className="card feedback">
          <span className={`verdict ${feedback.passed ? 'verdict--ok' : 'verdict--warn'}`}>
            {feedback.passed ? <CheckIcon /> : <AlertIcon />}
            {feedback.passed ? 'Bien' : 'À revoir'}
          </span>
          <div className="scores">
            <span>
              Точность <b>{feedback.accuracy}%</b>
            </span>
            <span>
              Беглость <b>{feedback.fluency}%</b>
            </span>
          </div>

          <p className="transcript">«{feedback.transcript}»</p>
          {feedback.feedbackFr && <p className="feedback-fr">{feedback.feedbackFr}</p>}
          {feedback.feedbackRu && <p className="feedback-ru">{feedback.feedbackRu}</p>}

          {feedback.issues.length > 0 && (
            <ul className="corrections">
              {feedback.issues.map((iss, i) => (
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
          )}

          {feedback.learnedWords.length > 0 && (
            <div className="learned">
              {feedback.learnedWords.map((w, i) => (
                <button
                  key={i}
                  type="button"
                  className="word-chip"
                  onClick={() => speakFr(w.fr)}
                >
                  <SpeakerIcon />
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
            {isLast ? 'Terminer' : 'Suivant'}
            {!isLast && <ArrowRightIcon />}
          </button>
        </section>
      ) : (
        <section className="answer-area">
          {mode === 'voice' ? (
            <div className="voice-area">
              <div
                className={`wave${recorder.isRecording ? ' wave--live' : ''}`}
                aria-hidden="true"
              >
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
                {recorder.isRecording ? (
                  <>
                    <StopIcon />
                    Stop
                  </>
                ) : evaluating ? (
                  <>
                    <span className="spinner" />
                    …
                  </>
                ) : (
                  <>
                    <MicIcon />
                    Parler
                  </>
                )}
              </button>
              <p className="hint">
                {recorder.isRecording
                  ? 'Говорите — волна реагирует на голос'
                  : evaluating
                    ? 'Оцениваем ответ…'
                    : 'Нажмите и ответьте по-французски'}
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
                {evaluating ? 'On vérifie…' : 'Vérifier'}
              </button>
            </form>
          )}
        </section>
      )}

      {(serviceError || recorder.error) && (
        <p className="error">
          <AlertIcon />
          {serviceError ??
            'Нет доступа к микрофону. Разрешите его в настройках браузера.'}
        </p>
      )}
    </main>
  )
}
