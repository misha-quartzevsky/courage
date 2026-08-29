import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import type {
  EvaluationVerdict,
  SprintExercise,
  SprintSession,
} from '../lib/types'
import { evaluateAnswer } from '../lib/gemini'
import { checkExercise, type CheckResult } from '../lib/check'
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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Синтетический вердикт для локально проверяемых упражнений.
function localVerdict(
  ex: SprintExercise,
  res: CheckResult,
): EvaluationVerdict {
  return {
    exerciseId: ex.id,
    transcript: res.got,
    accuracy: res.correct ? 100 : 0,
    fluency: res.correct ? 100 : 0,
    passed: res.correct,
    issues: res.correct
      ? []
      : [{ snippet: res.got || '—', correctionFr: res.expected, correctionRu: '' }],
    learnedWords: [],
    feedbackFr: '',
    feedbackRu: res.correct ? 'Верно.' : 'Правильный вариант — ниже.',
  }
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

  // Озвучиваем французский текст задания при смене упражнения.
  useEffect(() => {
    if (!exercise) return
    const fr =
      exercise.kind === 'dialogue' || exercise.kind === 'choice'
        ? exercise.promptFr
        : exercise.kind === 'gap'
          ? exercise.textFr.replace(/\{\}/g, '…')
          : exercise.kind === 'transform'
            ? exercise.sourceFr
            : ''
    if (fr) speakFr(fr)
  }, [exercise])

  const pushVerdict = useCallback((v: EvaluationVerdict) => {
    setFeedback(v)
    setVerdicts((prev) => [...prev, v])
  }, [])

  const submitLocal = useCallback(
    (answer: unknown) => {
      if (!exercise) return
      pushVerdict(localVerdict(exercise, checkExercise(exercise, answer)))
    },
    [exercise, pushVerdict],
  )

  const submitDialogue = useCallback(
    async (
      answer:
        | { type: 'voice'; audioBase64: string; mimeType: string }
        | { type: 'text'; text: string },
    ) => {
      if (!exercise || exercise.kind !== 'dialogue') return
      setEvaluating(true)
      setServiceError(null)
      try {
        pushVerdict(await evaluateAnswer(sprint, exercise, answer))
      } catch (err) {
        console.error('evaluateAnswer failed', err)
        setServiceError(
          'Не удалось проверить ответ. Проверьте соединение и попробуйте ещё раз.',
        )
      } finally {
        setEvaluating(false)
      }
    },
    [sprint, exercise, pushVerdict],
  )

  const handleMicClick = () => {
    if (recorder.error) {
      setServiceError('Нет доступа к микрофону. Разрешите его в настройках браузера.')
      return
    }
    if (recorder.isRecording) {
      void recorder.stop().then((audio) => {
        if (audio) {
          return submitDialogue({
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
    void submitDialogue({ type: 'text', text: textInput.trim() })
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
        <div
          className="progress"
          aria-label={`Упражнение ${idx + 1} из ${exercises.length}`}
        >
          {exercises.map((ex, i) => (
            <span
              key={ex.id}
              className={`progress-seg${
                i < idx
                  ? ' progress-seg--done'
                  : i === idx
                    ? ' progress-seg--current'
                    : ''
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

      <p className="exercise-prompt muted">{exercise.promptRu}</p>

      {feedback ? (
        <FeedbackCard
          feedback={feedback}
          isLast={isLast}
          onNext={handleNext}
        />
      ) : exercise.kind === 'dialogue' ? (
        <DialoguePane
          exercise={exercise}
          mode={mode}
          recorder={recorder}
          evaluating={evaluating}
          textInput={textInput}
          setTextInput={setTextInput}
          onMic={handleMicClick}
          onTextSubmit={handleTextSubmit}
        />
      ) : exercise.kind === 'gap' ? (
        <GapPane exercise={exercise} onSubmit={submitLocal} />
      ) : exercise.kind === 'choice' ? (
        <ChoicePane exercise={exercise} onSubmit={submitLocal} />
      ) : exercise.kind === 'order' ? (
        <OrderPane exercise={exercise} onSubmit={submitLocal} />
      ) : exercise.kind === 'transform' ? (
        <TransformPane exercise={exercise} onSubmit={submitLocal} />
      ) : (
        <MatchPane exercise={exercise} onSubmit={submitLocal} />
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

/* ---------- Feedback ---------- */

function FeedbackCard({
  feedback,
  isLast,
  onNext,
}: {
  feedback: EvaluationVerdict
  isLast: boolean
  onNext: () => void
}) {
  return (
    <section className="card feedback">
      <span
        className={`verdict ${feedback.passed ? 'verdict--ok' : 'verdict--warn'}`}
      >
        {feedback.passed ? <CheckIcon /> : <AlertIcon />}
        {feedback.passed ? 'Верно' : 'Есть что поправить'}
      </span>

      {(feedback.accuracy > 0 || feedback.fluency > 0) && feedback.transcript && (
        <p className="transcript">«{feedback.transcript}»</p>
      )}
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

      <button type="button" className="btn" onClick={onNext}>
        {isLast ? 'Terminer' : 'Suivant'}
        {!isLast && <ArrowRightIcon />}
      </button>
    </section>
  )
}

/* ---------- Dialogue ---------- */

function DialoguePane({
  exercise,
  mode,
  recorder,
  evaluating,
  textInput,
  setTextInput,
  onMic,
  onTextSubmit,
}: {
  exercise: Extract<SprintExercise, { kind: 'dialogue' }>
  mode: Mode
  recorder: ReturnType<typeof useRecorder>
  evaluating: boolean
  textInput: string
  setTextInput: (v: string) => void
  onMic: () => void
  onTextSubmit: (e: FormEvent) => void
}) {
  return (
    <>
      <section className="card card-raised situation">
        <button
          type="button"
          className="btn-icon"
          aria-label="Озвучить"
          onClick={() => speakFr(exercise.promptFr)}
        >
          <SpeakerIcon />
        </button>
        <p className="dialogue">{exercise.promptFr}</p>
      </section>

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
                      0.25 + recorder.audioLevel * (0.35 + (0.65 * (i % 5)) / 4)
                    })`,
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              className={`mic-btn${recorder.isRecording ? ' mic-btn--live' : ''}`}
              disabled={evaluating}
              onClick={onMic}
            >
              {recorder.isRecording ? (
                <>
                  <StopIcon />
                  Stop
                </>
              ) : evaluating ? (
                <>
                  <span className="spinner" />…
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
          <form className="text-form" onSubmit={onTextSubmit}>
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
    </>
  )
}

/* ---------- Gap ---------- */

function GapPane({
  exercise,
  onSubmit,
}: {
  exercise: Extract<SprintExercise, { kind: 'gap' }>
  onSubmit: (a: string[]) => void
}) {
  const parts = exercise.textFr.split('{}')
  const [values, setValues] = useState<string[]>(
    () => exercise.blanks.map(() => ''),
  )
  const ready = values.every((v) => v.trim())

  return (
    <section className="card exercise-pane">
      <p className="gap-text serif">
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {i < exercise.blanks.length && (
              <input
                className="gap-input"
                value={values[i]}
                onChange={(e) => {
                  const next = [...values]
                  next[i] = e.target.value
                  setValues(next)
                }}
                aria-label={`Пропуск ${i + 1}`}
                autoFocus={i === 0}
              />
            )}
          </span>
        ))}
      </p>
      <button
        type="button"
        className="btn"
        disabled={!ready}
        onClick={() => onSubmit(values)}
      >
        Vérifier
      </button>
    </section>
  )
}

/* ---------- Choice ---------- */

function ChoicePane({
  exercise,
  onSubmit,
}: {
  exercise: Extract<SprintExercise, { kind: 'choice' }>
  onSubmit: (a: number) => void
}) {
  return (
    <section className="card exercise-pane">
      <p className="choice-prompt serif">{exercise.promptFr}</p>
      <div className="stack">
        {exercise.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            className="option-btn"
            onClick={() => onSubmit(i)}
          >
            <span className="option-title serif">{opt}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

/* ---------- Order ---------- */

function OrderPane({
  exercise,
  onSubmit,
}: {
  exercise: Extract<SprintExercise, { kind: 'order' }>
  onSubmit: (a: string[]) => void
}) {
  const bankInit = useMemo(
    () => shuffle(exercise.tokens.map((t, i) => ({ t, key: i }))),
    [exercise],
  )
  const [bank, setBank] = useState(bankInit)
  const [line, setLine] = useState<{ t: string; key: number }[]>([])

  return (
    <section className="card exercise-pane">
      <div className="order-line serif">
        {line.length === 0 && <span className="muted">Нажимайте на слова…</span>}
        {line.map((tok) => (
          <button
            key={tok.key}
            type="button"
            className="token token--picked"
            onClick={() => {
              setLine(line.filter((x) => x.key !== tok.key))
              setBank([...bank, tok])
            }}
          >
            {tok.t}
          </button>
        ))}
      </div>
      <div className="order-bank">
        {bank.map((tok) => (
          <button
            key={tok.key}
            type="button"
            className="token"
            onClick={() => {
              setBank(bank.filter((x) => x.key !== tok.key))
              setLine([...line, tok])
            }}
          >
            {tok.t}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn"
        disabled={bank.length > 0}
        onClick={() => onSubmit(line.map((x) => x.t))}
      >
        Vérifier
      </button>
    </section>
  )
}

/* ---------- Transform ---------- */

function TransformPane({
  exercise,
  onSubmit,
}: {
  exercise: Extract<SprintExercise, { kind: 'transform' }>
  onSubmit: (a: string) => void
}) {
  const [value, setValue] = useState('')
  return (
    <section className="card exercise-pane">
      <p className="transform-source serif">{exercise.sourceFr}</p>
      <form
        className="text-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (value.trim()) onSubmit(value.trim())
        }}
      >
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Перепишите фразу…"
          rows={2}
          autoFocus
        />
        <button type="submit" className="btn" disabled={!value.trim()}>
          Vérifier
        </button>
      </form>
    </section>
  )
}

/* ---------- Match ---------- */

function MatchPane({
  exercise,
  onSubmit,
}: {
  exercise: Extract<SprintExercise, { kind: 'match' }>
  onSubmit: (a: number[]) => void
}) {
  // Правый столбец перемешан; храним исходный индекс пары.
  const right = useMemo(
    () => shuffle(exercise.pairs.map((p, i) => ({ ru: p.ru, pairIdx: i }))),
    [exercise],
  )
  const [sel, setSel] = useState<number | null>(null) // индекс строки слева
  const [links, setLinks] = useState<(number | null)[]>(
    () => exercise.pairs.map(() => null),
  ) // links[leftIdx] = pairIdx выбранной справа
  const ready = links.every((l) => l !== null)

  const rightUsed = new Set(links.filter((l): l is number => l !== null))

  return (
    <section className="card exercise-pane">
      <div className="match-grid">
        <div className="match-col">
          {exercise.pairs.map((p, i) => (
            <button
              key={i}
              type="button"
              className={`match-cell serif${sel === i ? ' match-cell--sel' : ''}${
                links[i] !== null ? ' match-cell--done' : ''
              }`}
              onClick={() => setSel(sel === i ? null : i)}
            >
              {p.fr}
              {links[i] !== null && (
                <span className="muted"> · {exercise.pairs[links[i]!].ru}</span>
              )}
            </button>
          ))}
        </div>
        <div className="match-col">
          {right.map((r) => (
            <button
              key={r.pairIdx}
              type="button"
              className="match-cell"
              disabled={rightUsed.has(r.pairIdx) || sel === null}
              onClick={() => {
                if (sel === null) return
                const next = [...links]
                next[sel] = r.pairIdx
                setLinks(next)
                setSel(null)
              }}
            >
              {r.ru}
            </button>
          ))}
        </div>
      </div>
      <div className="match-actions">
        <button
          type="button"
          className="btn btn-secondary btn-tight"
          onClick={() => setLinks(exercise.pairs.map(() => null))}
        >
          Сбросить
        </button>
        <button
          type="button"
          className="btn"
          disabled={!ready}
          onClick={() => onSubmit(links as number[])}
        >
          Vérifier
        </button>
      </div>
    </section>
  )
}
