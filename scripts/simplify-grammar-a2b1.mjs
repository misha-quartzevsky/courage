// Разовый патч: добавляет plain_ru («в двух словах») правилам A2 и B1 (~70 шт).
//
//   node scripts/simplify-grammar-a2b1.mjs          # генерит недостающее + патчит
//   node scripts/simplify-grammar-a2b1.mjs --patch  # только патч из кэша, без сети
//
// Генерация plain_ru — один вызов Gemini на правило (через Worker-прокси),
// результат кэшируется в scripts/.cache/plain-a2b1.json (можно править руками).
// Патч — точечный по строкам: у JSON нестандартное форматирование, весь файл
// НЕ пересериализуем. Идемпотентен: правила, где plain_ru уже есть, пропускаем.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = resolve(ROOT, 'grammar-rules-A1-A2-B1.json')
const CACHE_DIR = resolve(ROOT, 'scripts/.cache')
const CACHE = resolve(CACHE_DIR, 'plain-a2b1.json')
const MODEL = 'gemini-flash-lite-latest'

function workerUrl() {
  try {
    const env = readFileSync(resolve(ROOT, '.env'), 'utf8')
    return env.match(/^VITE_GEMINI_WORKER_URL\s*=\s*(.+)$/m)?.[1].trim().replace(/\/$/, '') ?? null
  } catch {
    return null
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function extractText(t) {
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  return (m ? m[1] : t).trim()
}

async function genPlain(worker, rule) {
  const prompt = [
    'Дай ОДНО короткое предложение по-русски — «в двух словах», совсем простым языком,',
    'без грамматических терминов там, где можно без них, — что делает это правило и когда',
    'его берут. Как будто объясняешь занятому взрослому, который устал. Только само',
    'предложение, без кавычек и префиксов.',
    '',
    `Правило: «${rule.title_fr}» (${rule.title_ru}).`,
    `Суть: ${rule.summary_ru}`,
    `Образование: ${rule.formation_rule}`,
  ].join('\n')
  const body = {
    systemInstruction: { parts: [{ text: prompt }] },
    contents: [{ role: 'user', parts: [{ text: 'Одно предложение.' }] }],
    generationConfig: { temperature: 0.5, maxOutputTokens: 300 },
  }
  for (let a = 1; a <= 4; a++) {
    const res = await fetch(`${worker}/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 429) {
      await sleep(a * 20000)
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const j = await res.json()
    const txt = j?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    const line = extractText(txt).replace(/\s+/g, ' ').replace(/^["'«»]+|["'«»]+$/g, '').trim()
    if (line.length >= 10) return line
    throw new Error('пустой ответ')
  }
  throw new Error('429 x4')
}

async function main() {
  const rules = JSON.parse(readFileSync(FILE, 'utf8'))
  const targets = rules.filter(
    (r) => ['a2', 'b1'].includes(String(r.level).toLowerCase()) && !r.plain_ru,
  )
  mkdirSync(CACHE_DIR, { recursive: true })
  const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {}

  const patchOnly = process.argv.includes('--patch')
  const worker = workerUrl()

  if (!patchOnly) {
    if (!worker) {
      console.error('Нет VITE_GEMINI_WORKER_URL в .env')
      process.exit(1)
    }
    for (const r of targets) {
      if (cache[r.id]) {
        console.log(`· ${r.id}: из кэша`)
        continue
      }
      try {
        cache[r.id] = await genPlain(worker, r)
        writeFileSync(CACHE, JSON.stringify(cache, null, 2) + '\n')
        console.log(`✓ ${r.id}: ${cache[r.id]}`)
      } catch (e) {
        console.error(`✗ ${r.id}: ${e.message}`)
      }
      await sleep(2500)
    }
  }

  // --- Патч: вставляем "plain_ru" после "summary_ru" у правил из кэша ---
  const raw = readFileSync(FILE, 'utf8')
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const q = (s) => JSON.stringify(s)
  let currentId = null
  let touched = 0
  const out = []
  for (const line of raw.split(/\r?\n/)) {
    const idm = line.match(/^"id":\s*"([^"]+)"/)
    if (idm) currentId = idm[1]
    out.push(line)
    if (
      currentId &&
      cache[currentId] &&
      /^"summary_ru":\s*"/.test(line) &&
      !rules.find((r) => r.id === currentId)?.plain_ru
    ) {
      out.push(`"plain_ru": ${q(cache[currentId])},`)
      touched++
    }
  }
  writeFileSync(FILE, out.join(eol))
  const parsed = JSON.parse(readFileSync(FILE, 'utf8'))
  const withPlain = parsed.filter(
    (r) => ['a2', 'b1'].includes(String(r.level).toLowerCase()) && r.plain_ru,
  ).length
  console.log(
    `\nПатч: +${touched} строк. A2/B1 с plain_ru: ${withPlain}. Всего правил: ${parsed.length}.`,
  )
}

main()
