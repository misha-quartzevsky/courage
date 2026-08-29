import { describe, expect, it } from 'vitest'
import {
  SESSIONS,
  SYLLABUS,
  availableLevels,
  courseProgress,
  isBelowLevel,
  levelComplete,
  nextSession,
  sessionsForUnit,
  syllabusByLevel,
  unitById,
  unitProgress,
} from './syllabus'

describe('syllabus', () => {
  it('содержит 36 юнитов A1–B1 в правильном порядке', () => {
    expect(SYLLABUS).toHaveLength(36)
    expect(SYLLABUS[0].id).toBe('a1-u1')
    expect(SYLLABUS[11].id).toBe('a1-u12')
    expect(SYLLABUS[12].id).toBe('a2-u1')
    expect(SYLLABUS[24].id).toBe('b1-u1')
    expect(SYLLABUS.at(-1)?.id).toBe('b1-u12')
  })

  it('каждый юнит имеет тему и хотя бы одно правило', () => {
    for (const u of SYLLABUS) {
      expect(u.titleFr.length).toBeGreaterThan(0)
      expect(u.titleRu.length).toBeGreaterThan(0)
      expect(u.ruleIds.length).toBeGreaterThan(0)
    }
  })

  it('availableLevels — уровни из данных по порядку', () => {
    expect(availableLevels()).toEqual(['A1', 'A2', 'B1'])
  })

  it('unitById находит юнит по id', () => {
    expect(unitById('a1-u1')?.unit).toBe(1)
    expect(unitById('b1-u5')?.level).toBe('B1')
    expect(unitById('нет-такого')).toBeUndefined()
  })

  it('nextSession без уровня — первое непройденное правило с начала', () => {
    expect(nextSession(new Set()).ruleId).toBe('a1-u1-verbes-etre-avoir')
    const u1Rules = sessionsForUnit('a1-u1').map((s) => s.ruleId)
    expect(nextSession(new Set(u1Rules)).ruleId).toBe('a1-u2-articles-indefinis')
    expect(
      nextSession(new Set(SESSIONS.map((s) => s.ruleId))).level,
    ).toBe('B1')
  })

  it('nextSession со стартовым уровнем — пропускает уровни ниже', () => {
    expect(nextSession(new Set(), 'A2').ruleId).toBe('a2-u1-passe-compose')
    expect(nextSession(new Set(['a2-u1-passe-compose']), 'A2').unitId).toBe(
      'a2-u1',
    )
    expect(nextSession(new Set(), 'B1').level).toBe('B1')
  })

  it('SESSIONS — плоский список правил в курсовом порядке', () => {
    expect(SESSIONS).toHaveLength(33 + 35 + 35)
    expect(SESSIONS[0].ruleId).toBe('a1-u1-verbes-etre-avoir')
    expect(sessionsForUnit('a1-u1')).toHaveLength(5)
    expect(sessionsForUnit('a1-u1').map((s) => s.indexInUnit)).toEqual([
      1, 2, 3, 4, 5,
    ])
  })

  it('unitProgress считает пройденные правила юнита', () => {
    expect(unitProgress('a1-u1', new Set())).toEqual({ done: 0, total: 5 })
    expect(
      unitProgress(
        'a1-u1',
        new Set(['a1-u1-verbes-etre-avoir', 'a1-u1-articles-definis']),
      ),
    ).toEqual({ done: 2, total: 5 })
  })

  it('isBelowLevel', () => {
    const a1u1 = unitById('a1-u1')!
    const b1u1 = unitById('b1-u1')!
    expect(isBelowLevel(a1u1, 'A2')).toBe(true)
    expect(isBelowLevel(b1u1, 'A2')).toBe(false)
    expect(isBelowLevel(a1u1, undefined)).toBe(false)
  })

  it('levelComplete — все правила уровня пройдены', () => {
    const a1 = SESSIONS.filter((s) => s.level === 'A1').map((s) => s.ruleId)
    expect(levelComplete('A1', new Set())).toBe(false)
    expect(levelComplete('A1', new Set(a1.slice(0, 20)))).toBe(false)
    expect(levelComplete('A1', new Set(a1))).toBe(true)
  })

  it('courseProgress считает правила от стартового уровня', () => {
    const p0 = courseProgress(new Set(), 'A2')
    expect(p0.total).toBe(70) // A2 (35) + B1 (35)
    expect(p0.done).toBe(0)
    expect(p0.lastLevel).toBe('B1')
    const inScope = ['a2-u1-passe-compose']
    const p1 = courseProgress(
      new Set([...inScope, 'a1-u1-verbes-etre-avoir']),
      'A2',
    )
    expect(p1.done).toBe(1) // правило A1 вне scope
    expect(p1.pct).toBe(Math.round((1 / 70) * 100))
  })

  it('syllabusByLevel группирует по уровню', () => {
    const groups = syllabusByLevel()
    expect(groups.map((g) => g.level)).toEqual(['A1', 'A2', 'B1'])
    for (const g of groups) expect(g.units).toHaveLength(12)
  })
})
