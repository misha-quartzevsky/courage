// Сборка встроенного французско-русского словаря из данных WikDict.
//
// Источник: WikDict fr-ru (данные Wiktionary / DBnary), лицензия CC BY-SA 3.0.
//   https://www.wikdict.com/  ·  https://download.wikdict.com/
//
// Запуск (вручную, при обновлении датасета — WikDict выпускает релизы раз в
// несколько месяцев):
//   node scripts/build-dictionary.mjs
//
// Результат — public/dict/fr-ru.json (массив { f, r }, отсортирован по
// важности слова) — КОММИТИТСЯ в репозиторий, чтобы сборка не ходила в сеть.

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WIKDICT_RELEASE = '2_2026-06'
const SRC_URL = `https://download.wikdict.com/dictionaries/sqlite/${WIKDICT_RELEASE}/fr-ru.sqlite3`
const SRC_PATH = resolve(ROOT, 'scripts/.cache/wikdict-fr-ru.sqlite3')
const OUT_JSON = resolve(ROOT, 'public/dict/fr-ru.json')
const OUT_LICENSE = resolve(ROOT, 'public/dict/LICENSE.txt')

const MAX_SENSES = 2 // сколько переводов оставляем на слово

// Выкидываем отдельные значения с русским матом/грубостью (не всю запись).
// Корень должен стоять в начале слова, чтобы не задеть «страх», «небо» и т. п.
const VULGAR =
  /(^|[\s,;()«»"'’-])(?:трах|еб[аеёиу]|ёб|бля|блят|блядь|хуй|хуё|хуе|пизд|дроч|залуп|говн|мудак|ссат|срат)/i
// Отдельные слова целиком: архаичный мат и грубое просторечие.
const VULGAR_WORD =
  /(?:^|[\s,;()«»"'’-])(?:ет[иь]|мл[яё]|мля[тд]ь|лоха?|елда|манда|прошмандовк\w*)(?:$|[\s,;()«»"'’-])/i

function pickSenses(rawR) {
  return String(rawR)
    .split(' | ')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !VULGAR.test(s) && !VULGAR_WORD.test(s))
    .slice(0, MAX_SENSES)
    .join('; ')
}

async function ensureSource() {
  if (existsSync(SRC_PATH)) return
  console.log(`Скачиваю ${SRC_URL} …`)
  const res = await fetch(SRC_URL)
  if (!res.ok) throw new Error(`WikDict HTTP ${res.status}`)
  mkdirSync(dirname(SRC_PATH), { recursive: true })
  writeFileSync(SRC_PATH, Buffer.from(await res.arrayBuffer()))
  console.log(`  сохранено: ${(statSync(SRC_PATH).size / 1e6).toFixed(1)} МБ`)
}

function build() {
  const db = new DatabaseSync(SRC_PATH, { readOnly: true })
  const rows = db
    .prepare(
      `SELECT written_rep AS f, trans_list AS r, rel_importance AS imp
         FROM simple_translation
        WHERE written_rep IS NOT NULL AND trans_list IS NOT NULL
        ORDER BY rel_importance DESC`,
    )
    .all()
  db.close()

  const seen = new Set()
  const out = []
  for (const { f: rawF, r: rawR } of rows) {
    const f = String(rawF).trim()
    const key = f.toLowerCase()
    if (f.length < 2 || seen.has(key)) continue
    const r = pickSenses(rawR)
    if (!r) continue
    seen.add(key)
    out.push({ f, r })
  }

  mkdirSync(dirname(OUT_JSON), { recursive: true })
  writeFileSync(OUT_JSON, JSON.stringify(out))
  writeFileSync(
    OUT_LICENSE,
    [
      'Французско-русский словарь: WikDict (https://www.wikdict.com/)',
      `Релиз WikDict: ${WIKDICT_RELEASE}. Пара fr-ru.`,
      'Построен из данных Wiktionary / DBnary.',
      'Лицензия: Creative Commons Attribution-ShareAlike 3.0 (CC BY-SA 3.0)',
      'https://creativecommons.org/licenses/by-sa/3.0/',
      '',
      'Производные данные (public/dict/fr-ru.json) распространяются на тех же условиях.',
      '',
    ].join('\n'),
  )

  console.log(
    `Готово: ${out.length} слов → ${OUT_JSON} ` +
      `(${(statSync(OUT_JSON).size / 1e6).toFixed(2)} МБ)`,
  )
}

await ensureSource()
build()
