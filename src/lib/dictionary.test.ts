import { describe, expect, it } from 'vitest'
import { normFr, searchDictionary, type DictEntry } from './dictionary'

describe('normFr', () => {
  it('снимает регистр, пробелы и диакритику', () => {
    expect(normFr('  Éléphant ')).toBe('elephant')
    expect(normFr('leçON')).toBe('lecon')
    expect(normFr('où')).toBe('ou')
  })
})

const DICT: DictEntry[] = [
  { f: 'chat', r: 'кот; кошка' },
  { f: 'château', r: 'замок' },
  { f: 'acheter', r: 'покупать' },
  { f: 'maison', r: 'дом' },
  { f: 'chien', r: 'собака' },
]

describe('searchDictionary', () => {
  it('пустой запрос — начало списка', () => {
    expect(searchDictionary(DICT, '  ', 3)).toHaveLength(3)
  })

  it('совпадения по началу слова идут первыми', () => {
    const res = searchDictionary(DICT, 'chat')
    expect(res.map((e) => e.f)).toEqual(['chat', 'château'])
  })

  it('подстрочные совпадения идут после префиксных', () => {
    // 'te' — префикса нет; подстрока у "château" и "acheter" (в порядке словаря).
    const res = searchDictionary(DICT, 'te')
    expect(res.map((e) => e.f)).toEqual(['château', 'acheter'])
  })

  it('находит по русскому переводу', () => {
    expect(searchDictionary(DICT, 'собака').map((e) => e.f)).toEqual(['chien'])
  })

  it('игнорирует диакритику в запросе', () => {
    expect(searchDictionary(DICT, 'chateau').map((e) => e.f)).toContain('château')
  })

  it('уважает limit', () => {
    expect(searchDictionary(DICT, 'c', 2)).toHaveLength(2)
  })
})
