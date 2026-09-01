// Сборка курированного тематического ядра словаря A1–B1.
//
// Источник — авторский список scripts/themed-words.mjs (THEMES). Здесь его
// разворачиваем, дедупим, СВЕРЯЕМ каждое французское слово с большим WikDict
// (public/dict/fr-ru.json) и сортируем внутри темы по частотности WikDict.
//
//   node scripts/build-themed-dict.mjs
//
// Результат — public/dict/fr-ru-themed.json (массив { f, r, theme, level }),
// КОММИТИТСЯ в репозиторий. Ненайденные в WikDict слова печатаются списком:
// это опечатки / неверный род / выдуманные формы — правим в themed-words.mjs.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { THEMES } from './themed-words.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WIKDICT_JSON = resolve(ROOT, 'public/dict/fr-ru.json')
const OUT_JSON = resolve(ROOT, 'public/dict/fr-ru-themed.json')
const OUT_LICENSE = resolve(ROOT, 'public/dict/THEMED-LICENSE.txt')

/** Ключ дедупа: регистр, апострофы, пробелы — но БЕЗ снятия диакритики
 *  (ou и où — разные слова). */
function dedupKey(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
}

/** Нормализация для сверки с WikDict: плюс снятие диакритики. */
function normFr(s) {
  return dedupKey(s)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

/** Слово без ведущего артикля / приглагольного se: "le chien" -> "chien". */
function coreFr(s) {
  return normFr(s).replace(/^(l'|le |la |les |un |une |des |du |de la |se |s')/, '')
}

/** Наивная форма ед. числа для сверки: chevaux/animaux не трогаем, просто -s/-x. */
function singular(s) {
  return s.replace(/(s|x)$/, '')
}

// --- WikDict: индекс слов + позиция (прокси частотности) ---
const wik = JSON.parse(readFileSync(WIKDICT_JSON, 'utf8'))
const wikRank = new Map() // normFr -> индекс (меньше = частотнее)
wik.forEach((e, i) => {
  const n = normFr(e.f)
  if (!wikRank.has(n)) wikRank.set(n, i)
  const c = coreFr(e.f)
  if (!wikRank.has(c)) wikRank.set(c, i)
})
function rankOf(fr) {
  for (const k of [normFr(fr), coreFr(fr), singular(coreFr(fr))]) {
    if (wikRank.has(k)) return wikRank.get(k)
  }
  return Infinity
}

// --- Разворачиваем THEMES ---
const seen = new Map() // normFr -> тема, где слово впервые встретилось
const dups = []
const missing = []
const out = []

for (const { theme, level, words } of THEMES) {
  if (!theme || !level || !Array.isArray(words)) {
    throw new Error(`Битая тема: ${JSON.stringify({ theme, level })}`)
  }
  for (const pair of words) {
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new Error(`Тема «${theme}»: пара не [fr, ru]: ${JSON.stringify(pair)}`)
    }
    const f = String(pair[0]).trim()
    const r = String(pair[1]).trim()
    if (!f || !r) throw new Error(`Тема «${theme}»: пустое значение в ${JSON.stringify(pair)}`)

    // Дедуп внутри темы: одно и то же слово может законно быть в двух темах
    // (aller — и «транспорт», и «частые глаголы»). Ловим только повтор в теме.
    const key = `${theme}|${dedupKey(f)}`
    if (seen.has(key)) {
      dups.push({ f, theme, first: theme })
      continue
    }
    seen.set(key, theme)

    const rank = rankOf(f)
    if (rank === Infinity) missing.push({ f, r, theme, phrase: /\s/.test(f.replace(/^(l'|d')/, '')) })
    out.push({ f, r, theme, level, _rank: rank })
  }
}

// --- Сортировка внутри темы: по частотности WikDict, ненайденные — в конец ---
const themeOrder = new Map(THEMES.map((t, i) => [t.theme, i]))
out.sort(
  (a, b) =>
    themeOrder.get(a.theme) - themeOrder.get(b.theme) ||
    a._rank - b._rank ||
    a.f.localeCompare(b.f, 'fr'),
)
const clean = out.map(({ f, r, theme, level }) => ({ f, r, theme, level }))

writeFileSync(OUT_JSON, JSON.stringify(clean))
writeFileSync(
  OUT_LICENSE,
  [
    'Тематическое ядро A1–B1 (public/dict/fr-ru-themed.json)',
    '',
    'Курированный вручную список для курса Courage. Отбор слов и русские',
    'переводы — авторские; французские заголовки сверены с WikDict',
    '(https://www.wikdict.com/, данные Wiktionary / DBnary).',
    '',
    'Лицензия: Creative Commons Attribution-ShareAlike 3.0 (CC BY-SA 3.0)',
    'https://creativecommons.org/licenses/by-sa/3.0/',
    '',
  ].join('\n'),
)

// --- Отчёт ---
const byLevel = clean.reduce((m, e) => ((m[e.level] = (m[e.level] || 0) + 1), m), {})
console.log(`Тем: ${THEMES.length}. Слов: ${clean.length} (${JSON.stringify(byLevel)}).`)
console.log(`Файл: ${(statSize(OUT_JSON) / 1024).toFixed(0)} КБ.`)

if (dups.length) {
  console.log(`\nДубли (пропущены, первое вхождение выигрывает): ${dups.length}`)
  for (const d of dups) console.log(`  «${d.f}» в «${d.theme}» — уже в «${d.first}»`)
}
const solo = missing.filter((m) => !m.phrase)
const phrases = missing.filter((m) => m.phrase)
if (solo.length) {
  console.log(`\nНЕ найдено в WikDict (одно слово — проверь написание/род): ${solo.length}`)
  for (const m of solo) console.log(`  [${m.theme}] ${m.f} — ${m.r}`)
}
if (phrases.length) {
  console.log(`\nФразы вне WikDict (ожидаемо, ранг = конец темы): ${phrases.length}`)
  for (const m of phrases) console.log(`  [${m.theme}] ${m.f} — ${m.r}`)
}
if (!missing.length) console.log('\nВсе слова найдены в WikDict. ✓')

function statSize(p) {
  return readFileSync(p).length
}
