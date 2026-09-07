// Сборка дрилл-тренажёра форм для уровня A1.
//
//   node scripts/build-drills.mjs            # все A1-правила
//   node scripts/build-drills.mjs a1-u1-...  # только указанные ruleId
//
// На каждое правило один раз спрашиваем Gemini (через Worker-прокси, ключ в
// секрете Worker'а) банк упражнений: список форм + на каждую форму 4–5 коротких
// простых предложений с пропуском и неверными формами + мини-текст.
// Результат — public/drills/<ruleId>.json + index.json, КОММИТИТСЯ в репозиторий.
// Рантайм эти файлы только читает и крутит по кругу — без сети.
//
// Правила с < 2 форм (не ложатся на форм-дрилл) помечаются — они остаются на
// прежнем пути warmup → sprint.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GRAMMAR_JSON = resolve(ROOT, 'grammar-rules-A1-A2-B1.json')
const OUT_DIR = resolve(ROOT, 'public/drills')
const MODEL = 'gemini-flash-lite-latest'

function workerUrl() {
  if (process.env.GEMINI_WORKER_URL) return process.env.GEMINI_WORKER_URL.replace(/\/$/, '')
  try {
    const env = readFileSync(resolve(ROOT, '.env'), 'utf8')
    const m = env.match(/^VITE_GEMINI_WORKER_URL\s*=\s*(.+)$/m)
    if (m) return m[1].trim().replace(/\/$/, '')
  } catch {
    /* нет .env */
  }
  return null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function extractJson(text) {
  const t = String(text).trim()
  if (t.startsWith('{') && t.endsWith('}')) {
    try {
      return JSON.parse(t)
    } catch {
      /* ниже */
    }
  }
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim())
    } catch {
      /* ниже */
    }
  }
  const a = t.indexOf('{')
  const b = t.lastIndexOf('}')
  if (a !== -1 && b > a) {
    try {
      return JSON.parse(t.slice(a, b + 1))
    } catch {
      return null
    }
  }
  return null
}

function buildPrompt(rule) {
  const exc = Object.entries(rule.key_exceptions ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
  const ex = (rule.authentic_examples ?? [])
    .map((e) => `«${e.fr}» — ${e.ru}`)
    .join('\n')
  return [
    'Ты собираешь тренажёр форм для уровня A1 (начинающий). Дано грамматическое правило.',
    'Задача: разбить его на ФОРМЫ (варианты) и дать на каждую много коротких простых упражнений-пропусков.',
    '',
    `Правило: «${rule.title_fr}» (${rule.title_ru}).`,
    rule.plain_ru ? `В двух словах: ${rule.plain_ru}` : '',
    `Суть: ${rule.summary_ru}`,
    `Образование: ${rule.formation_rule}`,
    exc ? `Формы/исключения:\n${exc}` : '',
    ex ? `Примеры:\n${ex}` : '',
    '',
    'ФОРМЫ:',
    '- для глагола — все 6 лиц (je, tu, il/elle, nous, vous, ils/elles); если правило про 2 глагола (être и avoir) — 12 форм.',
    '- для артиклей — le / la / les / l\'.',
    '- для рода/числа прилагательного — мужской / женский / множественное.',
    '- для отрицания — рамка (ne … pas): 2–4 показательных формы.',
    '- если у правила нет перечислимых форм (одна конструкция) — верни forms: [] (правило пойдёт другим путём).',
    '',
    'НА КАЖДУЮ ФОРМУ: 4–5 РАЗНЫХ очень коротких предложений (3–6 слов), простая бытовая лексика A1,',
    'без имён собственных, без профессий, без сложных слов. В каждом — ровно один пропуск {} на месте формы.',
    'Прилагательные с "je/tu/elle/nous/vous" — в женском роде или нейтральные',
    '(fatiguée, contente, prête, seule, ici, là, en retard), НЕ мужского рода.',
    'distractors — 2 НЕВЕРНЫЕ формы ИЗ ЭТОГО ЖЕ правила (не случайные слова).',
    '',
    'Верни ТОЛЬКО JSON, без markdown:',
    '{',
    '  "forms": [',
    '    { "label": "je", "answerFr": "suis",',
    '      "items": [',
    '        { "fr": "Je {} là.", "ru": "Я здесь.", "distractors": ["es","est"] }',
    '      ] }',
    '  ],',
    '  "text": { "fr": "связный текст 4–6 коротких предложений, где правило встречается", "ru": "полный перевод" }',
    '}',
  ]
    .filter(Boolean)
    .join('\n')
}

function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null
  const forms = Array.isArray(raw.forms) ? raw.forms : null
  if (!forms) return null
  const clean = []
  for (const f of forms) {
    if (!f || typeof f !== 'object') continue
    if (typeof f.label !== 'string' || !f.label.trim()) continue
    if (typeof f.answerFr !== 'string' || !f.answerFr.trim()) continue
    const items = Array.isArray(f.items) ? f.items : []
    const cleanItems = items
      .filter(
        (it) =>
          it &&
          typeof it.fr === 'string' &&
          it.fr.includes('{}') &&
          (it.fr.match(/\{\}/g) || []).length === 1 &&
          typeof it.ru === 'string' &&
          it.ru.trim() &&
          Array.isArray(it.distractors) &&
          it.distractors.filter((d) => typeof d === 'string' && d.trim()).length >= 1,
      )
      .map((it) => ({
        fr: it.fr.trim(),
        ru: it.ru.trim(),
        distractors: it.distractors
          .filter((d) => typeof d === 'string' && d.trim())
          .map((d) => d.trim())
          .slice(0, 3),
      }))
    if (cleanItems.length < 2) continue
    clean.push({
      label: f.label.trim(),
      answerFr: f.answerFr.trim(),
      items: cleanItems.slice(0, 6),
    })
  }
  const text =
    raw.text &&
    typeof raw.text.fr === 'string' &&
    typeof raw.text.ru === 'string' &&
    raw.text.fr.trim() &&
    raw.text.ru.trim()
      ? { fr: raw.text.fr.trim(), ru: raw.text.ru.trim() }
      : undefined
  return { forms: clean, text }
}

async function askGemini(worker, prompt) {
  const body = {
    systemInstruction: { parts: [{ text: prompt }] },
    contents: [{ role: 'user', parts: [{ text: 'Собери тренажёр.' }] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 8192 },
  }
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${worker}/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 429) {
      const wait = attempt * 20000
      console.log(`  429 — жду ${wait / 1000}с (попытка ${attempt}/4)`)
      await sleep(wait)
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = await res.json()
    const txt = json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    if (!txt.trim()) throw new Error('пустой ответ')
    return txt
  }
  throw new Error('429 после 4 попыток')
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const worker = workerUrl()
  if (!worker) {
    console.error('Нет VITE_GEMINI_WORKER_URL в .env — прервано.')
    process.exit(1)
  }

  const all = JSON.parse(readFileSync(GRAMMAR_JSON, 'utf8'))
  const only = process.argv.slice(2)
  let a1 = all.filter((r) => String(r.level).toLowerCase() === 'a1')
  if (only.length) a1 = a1.filter((r) => only.includes(r.id))

  const index = []
  // Существующий индекс (чтобы точечный прогон не терял остальные записи).
  const indexPath = resolve(OUT_DIR, 'index.json')
  const prevIndex = existsSync(indexPath)
    ? JSON.parse(readFileSync(indexPath, 'utf8'))
    : []

  for (const rule of a1) {
    process.stdout.write(`${rule.id}… `)
    try {
      const txt = await askGemini(worker, buildPrompt(rule))
      const drill = sanitize(extractJson(txt))
      if (!drill || drill.forms.length < 2) {
        console.log(`форм ${drill?.forms.length ?? 0} → на старый путь (warmup→sprint)`)
        continue
      }
      const doc = {
        ruleId: rule.id,
        titleRu: rule.title_ru,
        titleFr: rule.title_fr,
        plainRu: rule.plain_ru ?? rule.summary_ru?.split('\n')[0] ?? '',
        ...(drill.text ? { text: drill.text } : {}),
        forms: drill.forms,
      }
      writeFileSync(resolve(OUT_DIR, `${rule.id}.json`), JSON.stringify(doc, null, 2) + '\n')
      const stems = drill.forms.reduce((n, f) => n + f.items.length, 0)
      console.log(`✓ ${drill.forms.length} форм, ${stems} предложений${drill.text ? ', +текст' : ''}`)
      index.push({ ruleId: rule.id, titleRu: rule.title_ru, forms: drill.forms.length })
    } catch (e) {
      console.log(`✗ ${e.message}`)
    }
    await sleep(3000)
  }

  // Слить с предыдущим индексом по ruleId (точечный прогон не должен стирать остальное).
  const merged = new Map(prevIndex.map((e) => [e.ruleId, e]))
  for (const e of index) merged.set(e.ruleId, e)
  const finalIndex = [...merged.values()]
  writeFileSync(indexPath, JSON.stringify(finalIndex, null, 2) + '\n')
  writeFileSync(
    resolve(OUT_DIR, 'LICENSE.txt'),
    'Дрилл-банки в public/drills/ сгенерированы Gemini для учебного использования внутри приложения.\n' +
      'Исходные грамматические правила — grammar-rules-A1-A2-B1.json.\n',
  )
  console.log(`\nГотово: ${finalIndex.length} правил с дриллом.`)
}

main()
