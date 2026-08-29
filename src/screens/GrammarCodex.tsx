import { useMemo, useState } from 'react'
import { RULES, searchRules, type GrammarRule } from '../lib/grammar'
import { RuleCard } from './RuleCard'
import { SearchIcon } from '../lib/icons'

function RuleRow({ rule }: { rule: GrammarRule }) {
  return (
    <details className="rule-row">
      <summary>
        <span className="rule-row-title">{rule.titleRu}</span>
        <span className="rule-row-fr muted serif">{rule.titleFr}</span>
      </summary>
      <RuleCard rule={rule} />
    </details>
  )
}

export function GrammarCodex() {
  const [query, setQuery] = useState('')
  const q = query.trim()

  const found = useMemo(() => (q ? searchRules(q) : null), [q])

  // Без запроса — группировка по уровню → юниту.
  const groups = useMemo(() => {
    const byLevel = new Map<string, Map<number, GrammarRule[]>>()
    for (const r of RULES) {
      if (!byLevel.has(r.level)) byLevel.set(r.level, new Map())
      const units = byLevel.get(r.level)!
      if (!units.has(r.unit)) units.set(r.unit, [])
      units.get(r.unit)!.push(r)
    }
    return byLevel
  }, [])

  return (
    <main className="screen">
      <header>
        <h1 className="app-title">Справочник</h1>
      </header>

      <div className="search-field">
        <SearchIcon />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти правило: passé composé, артикли, отрицание…"
        />
      </div>

      {found ? (
        <>
          <p className="muted section-hint">
            {found.length === 0
              ? 'Ничего не нашлось'
              : `Найдено правил: ${found.length}`}
          </p>
          {found.map((r) => (
            <RuleRow key={r.id} rule={r} />
          ))}
        </>
      ) : (
        [...groups.entries()].map(([level, units]) => (
          <section key={level}>
            <p className="eyebrow codex-level">Уровень {level}</p>
            {[...units.entries()].map(([unit, rules]) => (
              <div key={unit} className="codex-unit">
                <p className="muted codex-unit-title">Юнит {unit}</p>
                {rules.map((r) => (
                  <RuleRow key={r.id} rule={r} />
                ))}
              </div>
            ))}
          </section>
        ))
      )}
    </main>
  )
}
