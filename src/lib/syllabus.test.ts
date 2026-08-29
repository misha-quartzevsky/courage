import { describe, expect, it } from 'vitest'
import { SYLLABUS, nextUnit, syllabusByLevel, unitById } from './syllabus'

describe('syllabus', () => {
  it('содержит 24 юнита A1–A2 в правильном порядке', () => {
    expect(SYLLABUS).toHaveLength(24)
    expect(SYLLABUS[0].id).toBe('a1-u1')
    expect(SYLLABUS[11].id).toBe('a1-u12')
    expect(SYLLABUS[12].id).toBe('a2-u1')
    expect(SYLLABUS.at(-1)?.id).toBe('a2-u12')
  })

  it('каждый юнит имеет тему и хотя бы одно правило', () => {
    for (const u of SYLLABUS) {
      expect(u.titleFr.length).toBeGreaterThan(0)
      expect(u.titleRu.length).toBeGreaterThan(0)
      expect(u.ruleIds.length).toBeGreaterThan(0)
    }
  })

  it('unitById находит юнит по id', () => {
    expect(unitById('a1-u1')?.unit).toBe(1)
    expect(unitById('a2-u5')?.level).toBe('A2')
    expect(unitById('нет-такого')).toBeUndefined()
  })

  it('nextUnit возвращает первый непройденный', () => {
    expect(nextUnit(new Set()).id).toBe('a1-u1')
    expect(nextUnit(new Set(['a1-u1', 'a1-u2'])).id).toBe('a1-u3')
    expect(nextUnit(new Set(SYLLABUS.map((u) => u.id))).id).toBe('a2-u12')
  })

  it('syllabusByLevel группирует по уровню', () => {
    const groups = syllabusByLevel()
    expect(groups.map((g) => g.level)).toEqual(['A1', 'A2'])
    expect(groups[0].units).toHaveLength(12)
    expect(groups[1].units).toHaveLength(12)
  })
})
