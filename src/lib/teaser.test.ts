import { describe, expect, it } from 'vitest'
import { buildTeaser } from './teaser'
import { getRule } from './grammar'
import type { GrammarRule } from './grammar'

const rule = (id: string): GrammarRule => {
  const r = getRule(id)
  if (!r) throw new Error(`нет правила ${id}`)
  return r
}

describe('buildTeaser', () => {
  it('детерминирован по (rule, seed)', () => {
    const r = rule('a1-u1-verbes-etre-avoir')
    expect(buildTeaser(r, 20260901)).toEqual(buildTeaser(r, 20260901))
  })

  it('меняется от seed к seed', () => {
    const r = rule('a1-u1-articles-definis')
    const bodies = new Set(
      [0, 1, 2, 3, 4, 5].map((s) => buildTeaser(r, 20260900 + s).body),
    )
    expect(bodies.size).toBeGreaterThan(1)
  })

  it('title и body непустые', () => {
    for (const s of [0, 1, 2, 3]) {
      const t = buildTeaser(rule('a1-u1-adjectif-quel'), 20260900 + s)
      expect(t.title.length).toBeGreaterThan(0)
      expect(t.body.length).toBeGreaterThan(0)
    }
  })

  it('pushTeaserRu побеждает шаблоны', () => {
    const r: GrammarRule = {
      ...rule('a1-u1-verbes-etre-avoir'),
      pushTeaserRu: 'РУЧНАЯ ЗАТРАВКА',
    }
    // seed без строки-«зачем» (seed % 4 !== 0)
    expect(buildTeaser(r, 20260901).body).toBe('РУЧНАЯ ЗАТРАВКА')
  })

  it('не бросает и без примеров', () => {
    const r: GrammarRule = { ...rule('a1-u1-verbes-etre-avoir'), examples: [] }
    for (const s of [0, 1, 2, 3]) {
      const t = buildTeaser(r, s)
      expect(t.body.length).toBeGreaterThan(0)
    }
  })

  it('строка-«зачем» появляется на seed % 4 === 0', () => {
    const r: GrammarRule = { ...rule('a1-u1-verbes-etre-avoir'), pushTeaserRu: 'X' }
    expect(buildTeaser(r, 20260904).body).toContain('во Франции') // 20260904 % 4 === 0
    expect(buildTeaser(r, 20260901).body).toBe('X')
  })
})
