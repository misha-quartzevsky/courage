import { useState } from 'react'
import type { CefrLevel, LearnerPersona } from '../lib/types'
import { extractPersona } from '../lib/gemini'
import { availableLevels } from '../lib/syllabus'
import { CloseIcon } from '../lib/icons'

const LEVELS: CefrLevel[] = availableLevels()

interface OnboardingProps {
  initialLevel: CefrLevel
  onSave: (persona: LearnerPersona, level: CefrLevel) => void | Promise<void>
}

export function Onboarding({ initialLevel, onSave }: OnboardingProps) {
  const [text, setText] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [draft, setDraft] = useState<LearnerPersona | null>(null)
  const [level, setLevel] = useState<CefrLevel>(
    LEVELS.includes(initialLevel) ? initialLevel : 'A1',
  )
  const [saving, setSaving] = useState(false)

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
    setDraft((d) =>
      d ? { ...d, [key]: d[key].filter((t) => t !== value) } : d,
    )
  }

  const save = async () => {
    if (!draft || saving) return
    setSaving(true)
    await onSave(draft, level)
  }

  return (
    <main className="screen">
      <header>
        <p className="eyebrow">Bienvenue</p>
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
            {analyzing ? 'On analyse…' : draft ? 'Analyser à nouveau' : 'Analyser'}
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
              <p className="eyebrow" style={{ marginTop: 16 }}>Intérêts</p>
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
              <p className="eyebrow" style={{ marginTop: 16 }}>Termes du métier</p>
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
        <h2>Niveau visé</h2>
        <div className="chips">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              className={`chip${level === l ? ' chip--active' : ''}`}
              onClick={() => setLevel(l)}
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
        {saving ? 'On enregistre…' : 'Enregistrer et commencer'}
      </button>
    </main>
  )
}
