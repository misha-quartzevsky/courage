import type { GrammarRule } from '../lib/grammar'
import { speakFr } from '../lib/speech'
import { SpeakerIcon } from '../lib/icons'

interface RuleCardProps {
  rule: GrammarRule
}

// Разбор одного правила понятным языком: сначала «когда», потом «как»,
// потом примеры и исключения. Без нагромождения терминов.
export function RuleCard({ rule }: RuleCardProps) {
  const exceptions = Object.entries(rule.keyExceptions)

  return (
    <section className="card rule-card">
      <header className="rule-head">
        <p className="rule-title-fr serif">{rule.titleFr}</p>
        <p className="rule-title-ru muted">{rule.titleRu}</p>
      </header>

      <div className="rule-block">
        <p className="eyebrow">Когда использовать</p>
        <p>{rule.summaryRu}</p>
      </div>

      <div className="rule-block">
        <p className="eyebrow">Как образуется</p>
        {rule.formationRule.split('\n').map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>

      {rule.examples.length > 0 && (
        <div className="rule-block">
          <p className="eyebrow">Примеры</p>
          <ul className="rule-examples">
            {rule.examples.map((ex, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="btn-icon"
                  aria-label={`Озвучить: ${ex.fr}`}
                  onClick={() => speakFr(ex.fr)}
                >
                  <SpeakerIcon />
                </button>
                <span>
                  <span className="serif">{ex.fr}</span>
                  <span className="muted"> — {ex.ru}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {exceptions.length > 0 && (
        <div className="rule-block">
          <p className="eyebrow">Исключения</p>
          <dl className="rule-exceptions">
            {exceptions.map(([k, v]) => (
              <div key={k}>
                <dt className="serif">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {rule.triggers.length > 0 && (
        <div className="rule-block">
          <p className="eyebrow">Слова-подсказки</p>
          <div className="chips">
            {rule.triggers.map((t) => (
              <span key={t} className="trigger-chip serif">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
