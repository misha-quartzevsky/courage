import { describe, expect, it } from 'vitest'
import {
  parseLearningText,
  parseRfiFeed,
  sentenceIndexAt,
  tokenize,
  wordKey,
} from './texts'

describe('tokenize', () => {
  it('делит по пробелам, пунктуация остаётся при слове', () => {
    expect(tokenize('Ma voisine a un chat noir.')).toEqual([
      'Ma',
      'voisine',
      'a',
      'un',
      'chat',
      'noir.',
    ])
  })
  it('детерминирована и без пустых токенов', () => {
    const s = '  Quand je  l’appelle,   il ne vient pas.  '
    expect(tokenize(s)).toEqual(tokenize(s))
    expect(tokenize(s).some((t) => t === '')).toBe(false)
  })
})

describe('wordKey', () => {
  it('снимает пунктуацию и регистр', () => {
    expect(wordKey('noir.')).toBe('noir')
    expect(wordKey('«Minuit»')).toBe('minuit')
    expect(wordKey('appelle,')).toBe('appelle')
    expect(wordKey('—')).toBe('')
  })
})

describe('sentenceIndexAt', () => {
  const starts = [0, 1711, 3027, 5593, 7238, 9607]
  it('возвращает индекс последнего начала <= ms', () => {
    expect(sentenceIndexAt(starts, 0)).toBe(0)
    expect(sentenceIndexAt(starts, 1500)).toBe(0)
    expect(sentenceIndexAt(starts, 1711)).toBe(1)
    expect(sentenceIndexAt(starts, 6000)).toBe(3)
    expect(sentenceIndexAt(starts, 999999)).toBe(5)
  })
  it('пустой массив → 0', () => {
    expect(sentenceIndexAt([], 100)).toBe(0)
  })
})

describe('parseLearningText', () => {
  const valid = {
    id: 'x',
    title: { fr: 'Titre', ru: 'Заголовок' },
    level: 'A1',
    source: 'curated',
    attribution: 'CC0',
    sentences: [
      { fr: 'Un.', ru: 'Раз.' },
      { fr: 'Deux.', ru: 'Два.' },
    ],
  }

  it('принимает валидный объект без аудио', () => {
    const t = parseLearningText(valid)
    expect(t?.id).toBe('x')
    expect(t?.audio).toBeUndefined()
  })

  it('принимает аудио только при совпадении длины sentenceStarts', () => {
    const ok = parseLearningText({
      ...valid,
      audio: { src: '/texts/x.wav', sentenceStarts: [0, 900], durationMs: 1800 },
    })
    expect(ok?.audio?.src).toBe('/texts/x.wav')

    const badLen = parseLearningText({
      ...valid,
      audio: { src: '/texts/x.wav', sentenceStarts: [0], durationMs: 1800 },
    })
    expect(badLen?.audio).toBeUndefined()
  })

  it('отбраковывает битую форму', () => {
    expect(parseLearningText(null)).toBeNull()
    expect(parseLearningText({ ...valid, sentences: [] })).toBeNull()
    expect(parseLearningText({ ...valid, level: 'C2' })).toBeNull()
    expect(parseLearningText({ ...valid, source: 'rfi' })).toBeNull()
    expect(parseLearningText({ ...valid, title: { fr: 'x' } })).toBeNull()
    expect(
      parseLearningText({ ...valid, sentences: [{ fr: 'a' }] }),
    ).toBeNull()
  })
})

describe('parseRfiFeed', () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item>
      <title><![CDATA[Journal en français facile 07/09/2026]]></title>
      <link>https://francaisfacile.rfi.fr/fr/podcasts/ep-1</link>
      <pubDate>Sun, 07 Sep 2026 20:00:00 GMT</pubDate>
      <enclosure url="https://aod-rfi.akamaized.net/rfi/ep1.mp3" type="audio/mpeg" length="1"/>
    </item>
    <item>
      <title>Deuxième</title>
      <guid isPermaLink="true">https://francaisfacile.rfi.fr/fr/podcasts/ep-2</guid>
      <pubDate>Sat, 06 Sep 2026 20:00:00 GMT</pubDate>
      <enclosure url="https://aod-rfi.akamaized.net/rfi/ep2.mp3"/>
    </item>
    <item><title>Без аудио</title><link>https://x</link></item>
  </channel></rss>`

  it('извлекает эпизоды с аудио, распаковывает CDATA, берёт guid если нет link', () => {
    const eps = parseRfiFeed(xml)
    expect(eps).toHaveLength(2)
    expect(eps[0].title).toBe('Journal en français facile 07/09/2026')
    expect(eps[0].pageUrl).toBe('https://francaisfacile.rfi.fr/fr/podcasts/ep-1')
    expect(eps[0].audioUrl).toBe('https://aod-rfi.akamaized.net/rfi/ep1.mp3')
    expect(eps[1].pageUrl).toBe('https://francaisfacile.rfi.fr/fr/podcasts/ep-2')
  })

  it('пустой / битый фид → []', () => {
    expect(parseRfiFeed('')).toEqual([])
    expect(parseRfiFeed('<rss></rss>')).toEqual([])
  })
})
