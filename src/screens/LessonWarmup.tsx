import { useEffect, useMemo, useRef, useState } from 'react'
import type { GrammarRule } from '../lib/grammar'
import { buildWarmup, buildAnswerMatches, type WarmupBeat } from '../lib/warmup'
import { speakFr } from '../lib/speech'
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  CloseIcon,
  SpeakerIcon,
} from '../lib/icons'

interface LessonWarmupProps {
  rule: GrammarRule
  loading: boolean
  error: boolean
  onStartPractice: () => void
  onEnough: () => void
  onCreditDay: () => void
  onClose: () => void
}

interface Path {
  primeIdx: number
  guessSeen: number
  guessHits: number
  explored: number
  buildDone: boolean
}

const EMPTY_PATH: Path = {
  primeIdx: 0,
  guessSeen: 0,
  guessHits: 0,
  explored: 0,
  buildDone: false,
}

export function LessonWarmup({
  rule,
  loading,
  error,
  onStartPractice,
  onEnough,
  onCreditDay,
  onClose,
}: LessonWarmupProps) {
  const beats = useMemo(() => buildWarmup(rule), [rule.id])
  const [idx, setIdx] = useState(0)
  const [path, setPath] = useState<Path>(EMPTY_PATH)
  const [lastGuessCorrect, setLastGuessCorrect] = useState<boolean | null>(null)

  const beat = beats[idx]
  const next = () => setIdx((i) => Math.min(i + 1, beats.length - 1))

  if (!beat) return null

  return (
    <main className="screen">
      <header className="topbar">
        <div
          className="progress"
          aria-label={`Шаг ${idx + 1} из ${beats.length}`}
        >
          {beats.map((b, i) => (
            <span
              key={b.id}
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
          onClick={onClose}
          aria-label="Назад"
        >
          <CloseIcon />
        </button>
      </header>

      <p className="exercise-prompt muted">
        {rule.level} · Юнит {rule.unit} · разминка
      </p>

      {beat.kind !== 'readiness' && (
        <button
          type="button"
          className="btn btn-secondary btn-tight warmup-skip"
          onClick={onStartPractice}
        >
          Сразу к практике
          <ArrowRightIcon />
        </button>
      )}

      {beat.kind === 'prime' && (
        <PrimePane
          beat={beat}
          onPick={(i) => {
            setPath((p) => ({ ...p, primeIdx: i }))
            next()
          }}
        />
      )}

      {beat.kind === 'guess' && (
        <GuessPane
          beat={beat}
          onPick={(i) => {
            const correct = !beat.allowAny && i === beat.answerIndex
            setLastGuessCorrect(beat.allowAny ? null : correct)
            setPath((p) => ({
              ...p,
              guessSeen: p.guessSeen + 1,
              guessHits: p.guessHits + (correct ? 1 : 0),
            }))
            next()
          }}
        />
      )}

      {beat.kind === 'reveal' && (
        <RevealPane
          beat={beat}
          guessCorrect={lastGuessCorrect}
          onNext={next}
        />
      )}

      {beat.kind === 'explore' && (
        <ExplorePane
          beat={beat}
          onNext={(count) => {
            setPath((p) => ({ ...p, explored: Math.max(p.explored, count) }))
            next()
          }}
        />
      )}

      {beat.kind === 'build' && (
        <WordBuildPane
          beat={beat}
          onNext={() => {
            setPath((p) => ({ ...p, buildDone: true }))
            next()
          }}
        />
      )}

      {beat.kind === 'readiness' && (
        <ReadinessPane
          path={path}
          loading={loading}
          error={error}
          onCreditDay={onCreditDay}
          onStartPractice={onStartPractice}
          onEnough={onEnough}
        />
      )}
    </main>
  )
}

/* ---------- Prime ---------- */

function PrimePane({
  beat,
  onPick,
}: {
  beat: Extract<WarmupBeat, { kind: 'prime' }>
  onPick: (i: number) => void
}) {
  return (
    <section className="card exercise-pane">
      <p className="choice-prompt">
        <span className="serif">{beat.topicRu}</span>
        <span className="muted"> — насколько знакомо?</span>
      </p>
      <div className="stack">
        {beat.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            className="option-btn"
            onClick={() => onPick(i)}
          >
            <span className="option-title">{opt}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

/* ---------- Guess ---------- */

function GuessPane({
  beat,
  onPick,
}: {
  beat: Extract<WarmupBeat, { kind: 'guess' }>
  onPick: (i: number) => void
}) {
  return (
    <section className="card exercise-pane">
      <p className="exercise-prompt muted">{beat.promptRu}</p>
      {beat.displayFr && (
        <p className="choice-prompt serif">
          {beat.displayFr}
          {beat.variant === 'translate' && (
            <button
              type="button"
              className="btn-icon"
              aria-label={`Озвучить: ${beat.displayFr}`}
              onClick={() => beat.displayFr && speakFr(beat.displayFr)}
            >
              <SpeakerIcon />
            </button>
          )}
        </p>
      )}
      <div className="stack">
        {beat.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            className="option-btn"
            onClick={() => onPick(i)}
          >
            <span className="option-title serif">{opt}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

/* ---------- Reveal ---------- */

function RevealPane({
  beat,
  guessCorrect,
  onNext,
}: {
  beat: Extract<WarmupBeat, { kind: 'reveal' }>
  guessCorrect: boolean | null
  onNext: () => void
}) {
  return (
    <section className="card warmup-reveal">
      <span className={`verdict${guessCorrect ? ' verdict--ok' : ''}`}>
        {guessCorrect ? <CheckIcon /> : null}
        {guessCorrect ? 'Ты это уже почувствовала' : 'Теперь видно, как это работает'}
      </span>

      <div className="rule-block">
        <p className="rule-title-fr serif">{beat.titleFr}</p>
        <p className="rule-title-ru muted">{beat.titleRu}</p>
      </div>

      <p>{beat.summaryRu}</p>

      {beat.formationLines.map((line, i) => (
        <p key={i} className="muted">
          {line}
        </p>
      ))}

      {beat.example && (
        <p className="rule-example">
          <button
            type="button"
            className="btn-icon"
            aria-label={`Озвучить: ${beat.example.fr}`}
            onClick={() => beat.example && speakFr(beat.example.fr)}
          >
            <SpeakerIcon />
          </button>
          <span>
            <span className="serif">{beat.example.fr}</span>
            <span className="muted"> — {beat.example.ru}</span>
          </span>
        </p>
      )}

      <button type="button" className="btn" onClick={onNext}>
        Дальше
        <ArrowRightIcon />
      </button>
    </section>
  )
}

/* ---------- Explore ---------- */

function ExplorePane({
  beat,
  onNext,
}: {
  beat: Extract<WarmupBeat, { kind: 'explore' }>
  onNext: (count: number) => void
}) {
  const [open, setOpen] = useState<Set<number>>(new Set())

  return (
    <section className="card exercise-pane">
      <p className="eyebrow">Загадки правила</p>
      <p className="hint">Нажми на форму, чтобы раскрыть.</p>
      <div className="chips">
        {beat.items.map((it, i) => (
          <button
            key={i}
            type="button"
            className={`token${open.has(i) ? ' token--picked' : ''}`}
            onClick={() =>
              setOpen((s) => {
                const nextSet = new Set(s)
                nextSet.add(i)
                return nextSet
              })
            }
          >
            {it.term}
          </button>
        ))}
      </div>

      {open.size > 0 && (
        <dl className="rule-exceptions">
          {[...open].map((i) => (
            <div key={i}>
              <dt className="serif">{beat.items[i].term}</dt>
              <dd>{beat.items[i].note}</dd>
            </div>
          ))}
        </dl>
      )}

      <button type="button" className="btn" onClick={() => onNext(open.size)}>
        Дальше
        <ArrowRightIcon />
      </button>
    </section>
  )
}

/* ---------- Word build ---------- */

function WordBuildPane({
  beat,
  onNext,
}: {
  beat: Extract<WarmupBeat, { kind: 'build' }>
  onNext: () => void
}) {
  const initial = useMemo(
    () => beat.tokens.map((t, i) => ({ t, key: i })),
    [beat],
  )
  const [bank, setBank] = useState(initial)
  const [line, setLine] = useState<{ t: string; key: number }[]>([])
  const [checked, setChecked] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const correct = checked && buildAnswerMatches(line.map((x) => x.t), beat.answer)

  return (
    <section className="card exercise-pane">
      <p className="exercise-prompt muted">
        {beat.promptRu}. Перевод: {beat.ru}
      </p>

      <div className="order-line serif">
        {line.length === 0 && <span className="muted">Нажимайте на слова…</span>}
        {line.map((tok) => (
          <button
            key={tok.key}
            type="button"
            className="token token--picked"
            onClick={() => {
              if (checked) return
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
              if (checked) return
              setBank(bank.filter((x) => x.key !== tok.key))
              setLine([...line, tok])
            }}
          >
            {tok.t}
          </button>
        ))}
      </div>

      {checked && (
        <span className={`verdict${correct ? ' verdict--ok' : ''}`}>
          {correct ? <CheckIcon /> : null}
          {correct ? 'Точно!' : 'Почти — так тоже запоминается.'}
        </span>
      )}
      {checked && !correct && revealed && (
        <p className="serif">{beat.answer}</p>
      )}

      {!checked ? (
        <button
          type="button"
          className="btn"
          disabled={bank.length > 0}
          onClick={() => setChecked(true)}
        >
          Проверить
        </button>
      ) : correct ? (
        <button type="button" className="btn" onClick={onNext}>
          Дальше
          <ArrowRightIcon />
        </button>
      ) : (
        <>
          {!revealed && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setRevealed(true)}
            >
              Показать
            </button>
          )}
          <button type="button" className="btn" onClick={onNext}>
            Дальше
            <ArrowRightIcon />
          </button>
        </>
      )}
    </section>
  )
}

/* ---------- Readiness ---------- */

function ReadinessPane({
  path,
  loading,
  error,
  onCreditDay,
  onStartPractice,
  onEnough,
}: {
  path: Path
  loading: boolean
  error: boolean
  onCreditDay: () => void
  onStartPractice: () => void
  onEnough: () => void
}) {
  const credited = useRef(false)
  useEffect(() => {
    if (credited.current) return
    credited.current = true
    onCreditDay()
  }, [onCreditDay])

  const ready = Math.max(
    50,
    Math.min(
      99,
      50 +
        path.guessHits * 12 +
        path.explored * 6 +
        (path.buildDone ? 10 : 0) +
        path.primeIdx * 6,
    ),
  )
  const band = ready >= 70 ? 'ok' : 'warn'
  const dots = path.guessHits + path.explored + (path.buildDone ? 1 : 0)

  const opener =
    path.primeIdx === 0
      ? 'Начали с чистого листа — и уже разобрались.'
      : path.primeIdx === 1
        ? 'Что-то помнила — теперь картинка целая.'
        : 'Уверенности прибавилось.'

  const intuition =
    path.guessHits > 0
      ? `Интуиция сработала: ${path.guessHits} из ${path.guessSeen} ты угадала до объяснения.`
      : path.guessSeen > 0
        ? 'Пробовала наугад — и увидела, как оно устроено.'
        : ''

  return (
    <>
      <section className="card card-raised score-card">
        <div className={`score score--${band}`}>{ready}%</div>
        <div className="score-verdict">
          {band === 'ok' ? 'Готова' : 'Почти на месте'}
        </div>
        <p className="muted">{opener}</p>
        {intuition && <p className="muted">{intuition}</p>}
        {path.explored > 0 && (
          <p className="muted">Разгадала маленьких подвохов: {path.explored}.</p>
        )}
        {path.buildDone && <p className="muted">Фразу собрала сама.</p>}
        {dots > 0 && (
          <div className="dots" aria-hidden="true">
            {Array.from({ length: dots }, (_, i) => (
              <span key={i} className="dot dot--pass" />
            ))}
          </div>
        )}
      </section>

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
        onClick={onStartPractice}
      >
        {loading ? 'Готовим упражнения…' : 'Ещё немного — практика'}
        {!loading && <ArrowRightIcon />}
      </button>
      <button type="button" className="btn btn-secondary" onClick={onEnough}>
        На сегодня хватит
      </button>
    </>
  )
}
