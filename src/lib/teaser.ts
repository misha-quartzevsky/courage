// Затравка для пуш-напоминания под конкретное правило.
// Чистый модуль (без Vite/DOM) — импортится и приложением, и Cloudflare Worker.
// Детерминирован по (rule, seed); seed — целое из даты (YYYYMMDD).

import type { GrammarRule } from './grammar'

export interface Teaser {
  title: string
  body: string
}

const PURPOSE_TAG = ' Живые фразы — те, что реально звучат во Франции.'
const GENERIC_TITLE = 'Французский на 2 минуты'

function firstWords(s: string, n: number): string {
  return s.trim().split(/\s+/).slice(0, n).join(' ')
}

function withPurpose(body: string, seed: number): string {
  return seed % 4 === 0 ? body + PURPOSE_TAG : body
}

export function buildTeaser(rule: GrammarRule, seed: number): Teaser {
  if (rule.pushTeaserRu) {
    return { title: GENERIC_TITLE, body: withPurpose(rule.pushTeaserRu, seed) }
  }

  const ex = rule.examples[0]
  const exTitle =
    ex && ex.fr.length <= 46 ? `«${ex.fr}»` : ex ? `«${firstWords(ex.fr, 5)}…»` : ''

  const templates: Teaser[] = [
    ...(ex
      ? [
          {
            title: exTitle,
            body: `по-русски «${ex.ru}». Логика другая — 2 минуты, посмотришь?`,
          },
          {
            title: GENERIC_TITLE,
            body: `Сегодня разберёшься, почему французы говорят «${firstWords(ex.fr, 4)}…».`,
          },
        ]
      : []),
    {
      title: GENERIC_TITLE,
      body: `${rule.titleRu}: как думаешь, как это устроено? Проверь догадку, это быстро.`,
    },
    {
      title: GENERIC_TITLE,
      body: `Новое правило — ${rule.titleRu}. Загляни на пару минут, когда будет пауза.`,
    },
  ]

  const pick = templates[seed % templates.length]
  return { title: pick.title, body: withPurpose(pick.body, seed) }
}
