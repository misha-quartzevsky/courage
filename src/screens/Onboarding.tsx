import { useState } from 'react'
import type { CefrLevel, LearnerPersona } from '../lib/types'
import { extractPersona } from '../lib/gemini'
import { availableLevels } from '../lib/syllabus'
import { CloseIcon } from '../lib/icons'

const LEVELS: CefrLevel[] = availableLevels()

// Can-do самооценка: берём самый высокий отмеченный уровень.
const ALL_CAN_DO: { text: string; level: CefrLevel }[] = [
  { text: 'Могу представиться, назвать профессию и возраст', level: 'A1' },
  { text: 'Свободно рассказываю о прошлом и привычках', level: 'A2' },
  { text: 'Могу описать планы, условие, гипотезу («если бы…»)', level: 'B1' },
  { text: 'Спорю, объясняю причины, строю сложные фразы', level: 'B1' },
]
const CAN_DO = ALL_CAN_DO.filter((s) => LEVELS.includes(s.level))

function levelRank(l: CefrLevel): number {
  return LEVELS.indexOf(l)
}

interface OnboardingProps {
  initialLevel: CefrLevel
  onSave: (persona: LearnerPersona, level: CefrLevel) => void | Promise<void>
}

export function Onboarding({ initialLevel, onSave }: OnboardingProps) {
  const [text, setText] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [draft, setDraft] = useState<LearnerPersona | null>(null)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [manualLevel, setManualLevel] = useState<CefrLevel | null>(
    LEVELS.includes(initialLevel) ? initialLevel : null,
  )
  const [saving, setSaving] = useState(false)

  const suggested: CefrLevel = [...checked]
    .map((i) => CAN_DO[i].level)
    .sort((a, b) => levelRank(b) - levelRank(a))[0] ?? LEVELS[0]
  const level = manualLevel ?? suggested

  const analyze = async () => {
    if (!text.trim() || analyzing) return
    setAnalyzing(true)
    try {
      const p = await extractPersona(text)
      setDraft({
        professionFr: p.professionFr,
        interestsFr: p.interestsFr,
        domainTags: p.domainTags,
      })
    } catch (err) {
      console.error('extractPersona failed', err)
      setDraft({ professionFr: text.trim().slice(0, 80), interestsFr: [], domainTags: [] })
    } finally {
      setAnalyzing(false)
    }
  }

  const dropTag = (key: 'interestsFr' | 'domainTags', value: string) => {
    setDraft((d) => (d ? { ...d, [key]: d[key].filter((t) => t !== value) } : d))
  }

  const toggleCanDo = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
    setManualLevel(null)
  }

  const save = async () => {
    if (!draft || saving) return
    setSaving(true)
    await onSave(draft, level)
  }

  return (
    <main className="screen">
      <header>
        <p className="eyebrow">Знакомимся</p>
        <h1 className="screen-title serif">Ваш контекст</h1>
        <p className="muted">
          Спринты на 30% строятся вокруг вашей работы и увлечений. Опишите их
          в одну-две фразы — остальное соберётся само.
        </p>
      </header>

      <section className="card">
        <h2>Профессия и интересы</h2>
        <div className="text-form">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Напр.: детский офтальмолог, горные лыжи, кулинария, настольные игры"
            rows={3}
            autoFocus
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!text.trim() || analyzing}
            onClick={analyze}
          >
            {analyzing ? 'Разбираем…' : draft ? 'Разобрать заново' : 'Разобрать'}
          </button>
        </div>
      </section>

      {draft && (
        <section className="card">
          <h2>Что получилось</h2>
          <p className="preview-line" style={{ fontSize: 18 }}>
            {draft.professionFr || '—'}
          </p>

          {draft.interestsFr.length > 0 && (
            <>
              <p className="eyebrow" style={{ marginTop: 16 }}>Интересы</p>
              <div className="learned">
                {draft.interestsFr.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="word-chip"
                    onClick={() => dropTag('interestsFr', t)}
                  >
                    {t} <CloseIcon />
                  </button>
                ))}
              </div>
            </>
          )}

          {draft.domainTags.length > 0 && (
            <>
              <p className="eyebrow" style={{ marginTop: 16 }}>Термины профессии</p>
              <div className="learned">
                {draft.domainTags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="word-chip"
                    onClick={() => dropTag('domainTags', t)}
                  >
                    {t} <CloseIcon />
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="muted section-hint">Нажмите на тег, чтобы убрать его.</p>
        </section>
      )}

      <section className="card">
        <h2>Ваш уровень французского</h2>
        {CAN_DO.length > 0 && (
          <ul className="can-do">
            {CAN_DO.map((s, i) => (
              <li key={i}>
                <label>
                  <input
                    type="checkbox"
                    checked={checked.has(i)}
                    onChange={() => toggleCanDo(i)}
                  />
                  <span>{s.text}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="muted section-hint">
          {checked.size > 0 && !manualLevel
            ? `Похоже, ваш уровень — ${suggested}. Можно поправить:`
            : 'Или выберите уровень вручную:'}
        </p>
        <div className="chips">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              className={`chip${level === l ? ' chip--active' : ''}`}
              onClick={() => setManualLevel(l)}
            >
              {l}
            </button>
          ))}
        </div>
      </section>

      <div className="spacer" />

      <button
        type="button"
        className="btn btn-lg"
        disabled={!draft || saving}
        onClick={save}
      >
        {saving ? 'Сохраняем…' : 'Сохранить и начать'}
      </button>
    </main>
  )
}
