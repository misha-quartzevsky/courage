import { useEffect, useMemo, useState } from 'react'
import type { Drill } from '../lib/types'
import { getRule, type GrammarRule } from '../lib/grammar'
import {
  buildRound,
  checkStep,
  loadDrill,
  type DrillStep,
} from '../lib/drill'
import { normalizeFr } from '../lib/check'
import { speakFr } from '../lib/speech'
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  CloseIcon,
  SpeakerIcon,
} from '../lib/icons'

interface LessonDrillProps {
  ruleId: string
  recheck?: boolean // круг-проверка выученного правила (пришли из dueRules)
  onFinish: (opts: { rounds: number; selfLearned: boolean; cleanRound: boolean }) => void
}

type Phase = 'guess' | 'intro' | 'text' | 'round' | 'roundEnd'

export function LessonDrill({ ruleId, recheck = false, onFinish }: LessonDrillProps) {
  const rule: GrammarRule | undefined = getRule(ruleId)
  const [drill, setDrill] = useState<Drill | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [phase, setPhase] = useState<Phase>(recheck ? 'round' : 'guess')

  const [guessPicked, setGuessPicked] = useState<string | null>(null)
  const [roundIdx, setRoundIdx] = useState(0)
  const [stepIdx, setStepIdx] = useState(0)
  const [roundMistakes, setRoundMistakes] = useState<string[]>([])
  const [roundsDone, setRoundsDone] = useState(0)
  const [cleanRoundEver, setCleanRoundEver] = useState(false)

  useEffect(() => {
    let alive = true
    loadDrill(ruleId).then((d) => {
      if (!alive) return
      setDrill(d)
      setStatus(d ? 'ready' : 'error')
    })
    return () => {
      alive = false
    }
  }, [ruleId])

  const steps = useMemo(
    () => (drill ? buildRound(drill, roundIdx) : []),
    [drill, roundIdx],
  )
  const step = steps[stepIdx]

  const guess = useMemo(() => {
    if (!drill) return null
    const f = drill.forms[0]
    const it = f.items[0]
    return {
      fr: it.fr.replace('{}', '____'),
      ru: it.ru,
      label: f.label,
      answer: f.answerFr,
      options: shuffleStable([f.answerFr, ...it.distractors.slice(0, 2)], ruleId),
    }
  }, [drill, ruleId])

  if (status === 'loading') {
    return (
      <main className="screen screen-center">
        <span className="spinner" />
      </main>
    )
  }
  if (status === 'error' || !drill) {
    return (
      <main className="screen">
        <p className="error">
          <AlertIcon />
          Тренажёр для этого правила не готов.
        </p>
        <button className="btn" onClick={() => onFinish({ rounds: 0, selfLearned: false, cleanRound: false })}>
          Назад
        </button>
      </main>
    )
  }

  const quit = () =>
    onFinish({
      rounds: roundsDone,
      selfLearned: false,
      cleanRound: cleanRoundEver,
    })

  // --- завершение шага ---
  const answerStep = (ok: boolean) => {
    if (!ok && step) {
      const label = step.formLabel ?? step.promptRu
      setRoundMistakes((m) => [...new Set([...m, label])])
    }
  }
  const nextStep = () => {
    if (stepIdx + 1 >= steps.length) {
      const clean = roundMistakes.length === 0
      setRoundsDone((n) => n + 1)
      if (clean) setCleanRoundEver(true)
      setPhase('roundEnd')
    } else {
      setStepIdx((i) => i + 1)
    }
  }
  const nextRound = () => {
    setRoundIdx((i) => i + 1)
    setStepIdx(0)
    setRoundMistakes([])
    setPhase('round')
  }

  return (
    <main className="screen drill">
      <header className="topbar">
        <div className="progress" aria-label={`Круг ${roundIdx + 1}`}>
          {(phase === 'round' ? steps : [0]).map((_, i) => (
            <span
              key={i}
              className={`progress-seg${
                phase === 'round' && i < stepIdx
                  ? ' progress-seg--done'
                  : phase === 'round' && i === stepIdx
                    ? ' progress-seg--current'
                    : ''
              }`}
            />
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-tight" onClick={quit}>
          <CloseIcon />
          Хватит
        </button>
      </header>

      <p className="exercise-prompt muted">
        {rule?.level ?? 'A1'} · {recheck ? 'проверка' : 'тренажёр'} · круг {roundIdx + 1}
      </p>

      {phase === 'guess' && guess && (
        <section className="card exercise-pane">
          <p className="exercise-prompt muted">Как думаешь — какая форма для «{guess.label}»?</p>
          <p className="choice-prompt serif">{guess.fr}</p>
          <div className="stack">
            {guess.options.map((o) => {
              const picked = guessPicked === o
              const reveal = guessPicked != null
              const right = normalizeFr(o) === normalizeFr(guess.answer)
              return (
                <button
                  key={o}
                  type="button"
                  className={`option-btn${
                    reveal && right ? ' option-btn--ok' : ''
                  }${reveal && picked && !right ? ' option-btn--no' : ''}`}
                  disabled={reveal}
                  onClick={() => setGuessPicked(o)}
                >
                  <span className="option-title serif">{o}</span>
                </button>
              )
            })}
          </div>
          {guessPicked != null && (
            <button type="button" className="btn" onClick={() => setPhase('intro')}>
              Дальше
              <ArrowRightIcon />
            </button>
          )}
        </section>
      )}

      {phase === 'intro' && (
        <section className="card warmup-reveal">
          <span className="verdict verdict--ok">
            <CheckIcon />
            {guessPicked && normalizeFr(guessPicked) === normalizeFr(guess?.answer ?? '')
              ? 'Верно почувствовала'
              : 'Смотри, как устроено'}
          </span>
          <div className="rule-block">
            <p className="rule-title-fr serif">{drill.titleFr}</p>
            <p className="rule-title-ru muted">{drill.titleRu}</p>
          </div>
          <p className="rule-plain serif">{drill.plainRu}</p>
          <p className="muted">
            Дальше — короткие фразы на каждую форму. Не запомнилось — «ещё круг».
            Знаешь — «выучила».
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => setPhase(drill.text ? 'text' : 'round')}
          >
            Начать
            <ArrowRightIcon />
          </button>
        </section>
      )}

      {phase === 'text' && drill.text && (
        <section className="card">
          <h2>Мини-текст</h2>
          <p className="serif reading-fr">{drill.text.fr}</p>
          <p className="muted">{drill.text.ru}</p>
          <button
            type="button"
            className="btn-icon"
            aria-label="Озвучить"
            onClick={() => speakFr(drill.text!.fr)}
          >
            <SpeakerIcon />
          </button>
          <button type="button" className="btn" onClick={() => setPhase('round')}>
            К тренажёру
            <ArrowRightIcon />
          </button>
        </section>
      )}

      {phase === 'round' && step && (
        <DrillStepPane
          key={`${roundIdx}-${stepIdx}`}
          step={step}
          onAnswered={answerStep}
          onNext={nextStep}
        />
      )}

      {phase === 'roundEnd' && (
        <RoundEndPane
          roundNo={roundIdx + 1}
          mistakes={roundMistakes}
          onLearned={() =>
            onFinish({
              rounds: roundsDone,
              selfLearned: true,
              cleanRound: roundMistakes.length === 0 || cleanRoundEver,
            })
          }
          onMore={nextRound}
          onStop={quit}
        />
      )}
    </main>
  )
}

/* ---------- один шаг круга ---------- */

function DrillStepPane({
  step,
  onAnswered,
  onNext,
}: {
  step: DrillStep
  onAnswered: (ok: boolean) => void
  onNext: () => void
}) {
  const [done, setDone] = useState<boolean | null>(null) // null | ok | no

  const settle = (ok: boolean) => {
    if (done != null) return
    setDone(ok)
    onAnswered(ok)
  }

  return (
    <section className="card exercise-pane">
      <p className="exercise-prompt muted">{step.promptRu}</p>

      {(step.kind === 'choice' || step.kind === 'bank') && (
        <ChoicePane step={step} done={done} onPick={settle} />
      )}
      {step.kind === 'tiles' && <TilesPane step={step} done={done} onCheck={settle} />}
      {step.kind === 'match' && <MatchPane step={step} done={done} onCheck={settle} />}
      {step.kind === 'odd' && <OddPane step={step} done={done} onPick={settle} />}

      {done != null && (
        <>
          <span className={`verdict${done ? ' verdict--ok' : ''}`}>
            {done ? <CheckIcon /> : <AlertIcon />}
            {done ? 'Верно' : verdictHint(step)}
          </span>
          <button type="button" className="btn" onClick={onNext}>
            Дальше
            <ArrowRightIcon />
          </button>
        </>
      )}
    </section>
  )
}

function verdictHint(step: DrillStep): string {
  if (step.kind === 'choice' || step.kind === 'bank') return `Правильно: ${step.answer}`
  if (step.kind === 'tiles') return `Правильно: ${step.answer}`
  if (step.kind === 'odd') return 'Ошибка была в другой фразе'
  return 'Не всё совпало'
}

function ChoicePane({
  step,
  done,
  onPick,
}: {
  step: DrillStep
  done: boolean | null
  onPick: (ok: boolean) => void
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const parts = step.fr.split('{}')
  return (
    <>
      <p className="choice-prompt serif">
        {parts[0]}
        <span className="gap-slot">{picked ?? '___'}</span>
        {parts[1]}
      </p>
      {step.ru && <p className="muted">{step.ru}</p>}
      <div className={step.kind === 'bank' ? 'chips' : 'stack'}>
        {(step.options ?? []).map((o) => {
          const right = o === step.answer
          const isPicked = picked === o
          return (
            <button
              key={o}
              type="button"
              className={
                step.kind === 'bank'
                  ? `token${done != null && right ? ' token--ok' : ''}${done != null && isPicked && !right ? ' token--no' : ''}`
                  : `option-btn${done != null && right ? ' option-btn--ok' : ''}${done != null && isPicked && !right ? ' option-btn--no' : ''}`
              }
              disabled={done != null}
              onClick={() => {
                setPicked(o)
                onPick(right)
              }}
            >
              <span className="serif">{o}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}

function TilesPane({
  step,
  done,
  onCheck,
}: {
  step: DrillStep
  done: boolean | null
  onCheck: (ok: boolean) => void
}) {
  const tokens = step.tokens ?? []
  const [line, setLine] = useState<number[]>([])
  const inBank = tokens.map((_, i) => i).filter((i) => !line.includes(i))

  const check = () => onCheck(checkStep(step, line.map((i) => tokens[i])))

  return (
    <>
      {step.ru && <p className="muted">{step.ru}</p>}
      <div className="order-line serif">
        {line.length === 0 && <span className="muted">Нажимайте на слова…</span>}
        {line.map((i) => (
          <button
            key={i}
            type="button"
            className="token token--picked"
            disabled={done != null}
            onClick={() => setLine((l) => l.filter((x) => x !== i))}
          >
            {tokens[i]}
          </button>
        ))}
      </div>
      <div className="order-bank">
        {inBank.map((i) => (
          <button
            key={i}
            type="button"
            className="token"
            disabled={done != null}
            onClick={() => setLine((l) => [...l, i])}
          >
            {tokens[i]}
          </button>
        ))}
      </div>
      {done == null && (
        <button
          type="button"
          className="btn"
          disabled={line.length !== tokens.length}
          onClick={check}
        >
          Проверить
        </button>
      )}
    </>
  )
}

function MatchPane({
  step,
  done,
  onCheck,
}: {
  step: DrillStep
  done: boolean | null
  onCheck: (ok: boolean) => void
}) {
  const left = step.left ?? []
  const right = step.right ?? []
  const [sel, setSel] = useState<number | null>(null)
  const [pairs, setPairs] = useState<Record<number, number>>({}) // leftIdx -> rightIdx

  const assignedRight = new Set(Object.values(pairs))
  const allDone = left.every((_, i) => pairs[i] != null)

  const check = () =>
    onCheck(checkStep(step, left.map((_, i) => pairs[i])))

  return (
    <>
      <div className="match-grid">
        <div className="match-col">
          {left.map((l, i) => (
            <button
              key={i}
              type="button"
              className={`match-cell${sel === i ? ' match-cell--sel' : ''}${pairs[i] != null ? ' match-cell--done' : ''}`}
              disabled={done != null}
              onClick={() => setSel(i)}
            >
              {l}
              {pairs[i] != null && <span className="muted"> → {right[pairs[i]]}</span>}
            </button>
          ))}
        </div>
        <div className="match-col">
          {right.map((r, j) => (
            <button
              key={j}
              type="button"
              className={`match-cell${assignedRight.has(j) ? ' match-cell--done' : ''}`}
              disabled={done != null || assignedRight.has(j) || sel == null}
              onClick={() => {
                if (sel == null) return
                setPairs((p) => ({ ...p, [sel]: j }))
                setSel(null)
              }}
            >
              <span className="serif">{r}</span>
            </button>
          ))}
        </div>
      </div>
      {done == null && (
        <>
          <button
            type="button"
            className="btn btn-secondary btn-tight"
            onClick={() => {
              setPairs({})
              setSel(null)
            }}
          >
            Сбросить
          </button>
          <button type="button" className="btn" disabled={!allDone} onClick={check}>
            Проверить
          </button>
        </>
      )}
    </>
  )
}

function OddPane({
  step,
  done,
  onPick,
}: {
  step: DrillStep
  done: boolean | null
  onPick: (ok: boolean) => void
}) {
  const [picked, setPicked] = useState<number | null>(null)
  return (
    <div className="stack">
      {(step.lines ?? []).map((l, i) => (
        <button
          key={i}
          type="button"
          className={`option-btn${done != null && i === step.wrongLine ? ' option-btn--ok' : ''}${done != null && picked === i && i !== step.wrongLine ? ' option-btn--no' : ''}`}
          disabled={done != null}
          onClick={() => {
            setPicked(i)
            onPick(i === step.wrongLine)
          }}
        >
          <span className="option-title serif">{l}</span>
        </button>
      ))}
    </div>
  )
}

/* ---------- конец круга ---------- */

function RoundEndPane({
  roundNo,
  mistakes,
  onLearned,
  onMore,
  onStop,
}: {
  roundNo: number
  mistakes: string[]
  onLearned: () => void
  onMore: () => void
  onStop: () => void
}) {
  return (
    <>
      <section className="card card-raised score-card">
        <div className={`score score--${mistakes.length === 0 ? 'ok' : 'warn'}`}>
          Круг {roundNo}
        </div>
        <p className="muted">
          {mistakes.length === 0
            ? 'Без ошибок.'
            : `Ошибки: ${mistakes.join(', ')}.`}
        </p>
      </section>

      <div className="spacer" />

      <button type="button" className="btn btn-lg" onClick={onLearned}>
        Выучила
        <CheckIcon />
      </button>
      {mistakes.length > 0 && (
        <p className="muted section-hint">
          В «{mistakes.join('», «')}» ещё путаешься — можно ещё круг.
        </p>
      )}
      <button type="button" className="btn btn-secondary" onClick={onMore}>
        Ещё круг
      </button>
      <button type="button" className="btn-tight btn-secondary" onClick={onStop}>
        Хватит на сегодня
      </button>
    </>
  )
}

/* ---------- utils ---------- */

function shuffleStable<T>(arr: T[], seed: string): T[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    const j = Math.floor(((h >>> 0) % 100000) / 100000 * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
