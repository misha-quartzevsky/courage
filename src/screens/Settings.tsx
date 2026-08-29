import { useState } from 'react'
import type { CefrLevel, LearnerPersona } from '../lib/types'
import type { ProfilePatch } from '../lib/supabase'
import { availableLevels } from '../lib/syllabus'

const LEVELS: CefrLevel[] = availableLevels()

interface SettingsProps {
  persona: LearnerPersona | null
  level: CefrLevel
  canSignOut: boolean
  onSave: (patch: ProfilePatch) => void | Promise<void>
  onSignOut: () => void
}

const toList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

export function Settings({
  persona,
  level,
  canSignOut,
  onSave,
  onSignOut,
}: SettingsProps) {
  const [profession, setProfession] = useState(persona?.professionFr ?? '')
  const [interests, setInterests] = useState(
    (persona?.interestsFr ?? []).join(', '),
  )
  const [tags, setTags] = useState((persona?.domainTags ?? []).join(', '))
  const [lvl, setLvl] = useState<CefrLevel>(level)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    if (saving) return
    setSaving(true)
    setSaved(false)
    await onSave({
      profession_text: profession.trim(),
      interests: toList(interests),
      domain_tags: toList(tags),
      target_level: lvl,
    })
    setSaving(false)
    setSaved(true)
  }

  return (
    <main className="screen">
      <header>
        <h1 className="app-title">Настройки</h1>
      </header>

      <section className="card">
        <h2>Профессия</h2>
        <div className="text-form">
          <input
            value={profession}
            onChange={(e) => setProfession(e.target.value)}
            placeholder="chirurgien vitréo-rétinien"
          />
        </div>
      </section>

      <section className="card">
        <h2>Интересы</h2>
        <div className="text-form">
          <input
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            placeholder="ski alpin, gastronomie, jeux de société"
          />
          <label>Через запятую.</label>
        </div>
      </section>

      <section className="card">
        <h2>Термины профессии</h2>
        <div className="text-form">
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="vitrectomie, décollement de la rétine"
          />
          <label>Через запятую. Идут в промпт для 30% персонализации.</label>
        </div>
      </section>

      <section className="card">
        <h2>Ваш уровень</h2>
        <div className="chips">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              className={`chip${lvl === l ? ' chip--active' : ''}`}
              onClick={() => setLvl(l)}
            >
              {l}
            </button>
          ))}
        </div>
        <p className="muted section-hint">
          С какого уровня начинается курс. Юниты ниже остаются доступны в карте.
        </p>
      </section>

      <div className="spacer" />

      <button
        type="button"
        className="btn btn-lg"
        disabled={saving || !profession.trim()}
        onClick={save}
      >
        {saving ? 'Сохраняем…' : saved ? 'Сохранено ✓' : 'Сохранить'}
      </button>

      {canSignOut && (
        <button type="button" className="btn btn-secondary" onClick={onSignOut}>
          Выйти
        </button>
      )}
    </main>
  )
}
