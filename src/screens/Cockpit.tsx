import type { CefrLevel, LearnerPersona } from '../lib/types'
import { PERSONA_LIST } from '../lib/personas'

export type Mode = 'voice' | 'text'

const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2']

interface CockpitProps {
  persona: LearnerPersona | null
  level: CefrLevel
  mode: Mode
  loading: boolean
  error: boolean
  streakDays: number
  onPersona: (p: LearnerPersona) => void
  onLevel: (l: CefrLevel) => void
  onMode: (m: Mode) => void
  onStart: () => void
}

export function Cockpit({
  persona,
  level,
  mode,
  loading,
  error,
  streakDays,
  onPersona,
  onLevel,
  onMode,
  onStart,
}: CockpitProps) {
  return (
    <main className="screen">
      <header className="topbar">
        <h1 className="app-title">Courage</h1>
        <span className="badge">{streakDays > 0 ? `🔥 ${streakDays} jour${streakDays > 1 ? 's' : ''}` : 'A1 → B2'}</span>
      </header>

      <section className="card">
        <h2>Кто вы?</h2>
        <div className="stack">
          {PERSONA_LIST.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`option-btn${persona?.id === p.id ? ' option-btn--active' : ''}`}
              onClick={() => onPersona(p)}
            >
              <span className="option-title">{p.label}</span>
              <span className="muted">{p.professionFr}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Целевой уровень</h2>
        <div className="chips">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              className={`chip${level === l ? ' chip--active' : ''}`}
              onClick={() => onLevel(l)}
            >
              {l}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Режим практики</h2>
        <div className="mode-toggle">
          <button
            type="button"
            className={mode === 'voice' ? 'seg seg--active' : 'seg'}
            onClick={() => onMode('voice')}
          >
            🎙 Voice
          </button>
          <button
            type="button"
            className={mode === 'text' ? 'seg seg--active' : 'seg'}
            onClick={() => onMode('text')}
          >
            🤫 Silent
          </button>
        </div>
        <p className="muted">
          {mode === 'voice'
            ? 'Живой диалог: слушаете ситуацию и отвечаете голосом.'
            : 'То же, но текстом — для метро и тихих мест.'}
        </p>
      </section>

      <section className="card hero">
        <h3>Сегодняшний спринт</h3>
        <p className="serif">
          «Se présenter, ouvrir un compte, parler de votre métier»
        </p>
        <p className="muted">
          4–6 минут. AI соберёт спринт из базы Édito + ваша специализация.
        </p>
      </section>

      {error && <p className="error">Оценка ответов сейчас недоступна (Gemini).</p>}

      <button
        type="button"
        className="btn"
        disabled={!persona || loading}
        onClick={onStart}
      >
        {loading ? 'Генерация спринта…' : 'Commencer le sprint'}
      </button>
    </main>
  )
}