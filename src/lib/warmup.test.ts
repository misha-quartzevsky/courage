import { describe, expect, it } from 'vitest'
import { buildWarmup } from './warmup'
import { getRule } from './grammar'

const rule = (id: string) => {
  const r = getRule(id)
  if (!r) throw new Error(`нет правила ${id}`)
  return r
}

describe('buildWarmup', () => {
  it('начинается с prime, заканчивается readiness', () => {
    const beats = buildWarmup(rule('a1-u1-verbes-etre-avoir'))
    expect(beats[0].kind).toBe('prime')
    expect(beats.at(-1)?.kind).toBe('readiness')
    expect(beats.some((b) => b.kind === 'reveal')).toBe(true)
  })

  it('guess: >=2 опции, answerIndex в диапазоне (или -1 при allowAny)', () => {
    for (const id of [
      'a1-u1-verbes-etre-avoir',
      'a1-u1-articles-definis',
      'a1-u1-adjectifs-nationalite',
      'a1-u1-prepositions-villes-pays',
    ]) {
      const g = buildWarmup(rule(id)).find((b) => b.kind === 'guess')
      if (!g || g.kind !== 'guess') throw new Error(`нет guess для ${id}`)
      expect(g.options.length).toBeGreaterThanOrEqual(2)
      if (g.allowAny) {
        expect(g.answerIndex).toBe(-1)
      } else {
        expect(g.answerIndex).toBeGreaterThanOrEqual(0)
        expect(g.answerIndex).toBeLessThan(g.options.length)
      }
    }
  })

  it('build: число токенов = числу слов в ответе', () => {
    for (const b of buildWarmup(rule('a1-u1-verbes-etre-avoir'))) {
      if (b.kind === 'build') {
        expect(b.tokens.length).toBe(b.answer.split(' ').length)
      }
    }
  })

  it('нет explore с пустыми items; explore появляется при keyExceptions', () => {
    for (const b of buildWarmup(rule('a1-u1-adjectifs-nationalite'))) {
      if (b.kind === 'explore') expect(b.items.length).toBeGreaterThan(0)
    }
    const withExc = buildWarmup(rule('a1-u1-adjectifs-nationalite'))
    const explore = withExc.find((b) => b.kind === 'explore')
    expect(explore).toBeDefined()
    if (explore?.kind === 'explore') {
      // и одиночный французский ключ, и русская фраза-ключ рендерятся как чип
      expect(explore.items.some((i) => i.term === 'grec')).toBe(true)
      expect(explore.items.some((i) => /[А-Яа-я]/.test(i.term))).toBe(true)
    }
  })

  it('правило без keyExceptions — без explore', () => {
    const beats = buildWarmup(rule('a1-u1-articles-definis'))
    expect(beats.some((b) => b.kind === 'explore')).toBe(false)
  })

  it('детерминирована по rule.id', () => {
    const a = buildWarmup(rule('a1-u1-verbes-etre-avoir'))
    const b = buildWarmup(rule('a1-u1-verbes-etre-avoir'))
    expect(a).toEqual(b)
  })
})
