import { describe, expect, it } from 'vitest'
import {
  SYLLABUS,
  availableLevels,
  isBelowLevel,
  nextUnit,
  syllabusByLevel,
  unitById,
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

  it('nextUnit без уровня — первый непройденный с начала', () => {
    expect(nextUnit(new Set()).id).toBe('a1-u1')
    expect(nextUnit(new Set(['a1-u1', 'a1-u2'])).id).toBe('a1-u3')
    expect(nextUnit(new Set(SYLLABUS.map((u) => u.id))).id).toBe('b1-u12')
  })

  it('nextUnit со стартовым уровнем — пропускает уровни ниже', () => {
    expect(nextUnit(new Set(), 'A2').id).toBe('a2-u1')
    expect(nextUnit(new Set(['a2-u1']), 'A2').id).toBe('a2-u2')
    expect(nextUnit(new Set(), 'B1').id).toBe('b1-u1')
  })

  it('isBelowLevel', () => {
    const a1u1 = unitById('a1-u1')!
    const b1u1 = unitById('b1-u1')!
    expect(isBelowLevel(a1u1, 'A2')).toBe(true)
    expect(isBelowLevel(b1u1, 'A2')).toBe(false)
    expect(isBelowLevel(a1u1, undefined)).toBe(false)
  })

  it('syllabusByLevel группирует по уровню', () => {
    const groups = syllabusByLevel()
    expect(groups.map((g) => g.level)).toEqual(['A1', 'A2', 'B1'])
    for (const g of groups) expect(g.units).toHaveLength(12)
  })
})
