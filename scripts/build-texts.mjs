// Сборка уровневых текстов для вкладки «Чтение» (пилон Lire/Écouter).
//
//   node scripts/build-texts.mjs
//
// Источник — инлайновый SOURCES ниже (public-domain / CC отрывки). Для каждого:
//   • режем fr и ru на предложения, сверяем число;
//   • озвучиваем весь текст через Gemini TTS (тот же Worker-прокси, что и спринты —
//     ключ в секрете Worker'а, локально не нужен);
//   • PCM из ответа оборачиваем в WAV;
//   • тайминги по словам Gemini TTS не даёт → начало каждого предложения
//     оцениваем пропорционально длине в символах.
//
// Результат — public/texts/<id>.wav + <id>.json + index.json + LICENSE.txt,
// КОММИТИТСЯ в репозиторий (сборка фронта TTS не вызывает). Если озвучка не
// удалась — текст пишется без аудио (ридер даст браузерный speakFr).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'public/texts')
const TTS_MODEL = 'gemini-2.5-flash-preview-tts'
const TTS_VOICE = 'Kore'

// --- Worker URL из .env (VITE_GEMINI_WORKER_URL) или из окружения ---
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

// --- Исходники: короткие отрывки public-domain / CC, с ручным переводом ---
// fr и ru должны биться на одинаковое число предложений (разделитель . ! ? …).
const SOURCES = [
  {
    id: 'chat-voisine',
    level: 'A1',
    title: { fr: 'Le chat de la voisine', ru: 'Кошка соседки' },
    attribution: 'Оригинальный текст (Courage), CC0.',
    fr: 'Ma voisine a un chat noir. Il s’appelle Minuit. Chaque matin, il vient dans mon jardin. Il aime dormir au soleil. Quand je l’appelle, il ne vient pas. Les chats font toujours ce qu’ils veulent.',
    ru: 'У моей соседки чёрная кошка. Её зовут Минюи. Каждое утро она приходит ко мне в сад. Она любит спать на солнце. Когда я её зову, она не приходит. Кошки всегда делают что хотят.',
  },
  {
    id: 'petit-dejeuner',
    level: 'A1',
    title: { fr: 'Le petit-déjeuner', ru: 'Завтрак' },
    attribution: 'Оригинальный текст (Courage), CC0.',
    fr: 'Le matin, je bois un café et je mange une tartine. Ma femme préfère le thé. Le dimanche, nous achetons des croissants à la boulangerie. Le boulanger nous connaît bien. Il dit toujours bonjour avec le sourire.',
    ru: 'Утром я пью кофе и ем бутерброд. Моя жена предпочитает чай. По воскресеньям мы покупаем круассаны в булочной. Пекарь нас хорошо знает. Он всегда здоровается с улыбкой.',
  },
  {
    id: 'marche-dimanche',
    level: 'A2',
    title: { fr: 'Le marché du dimanche', ru: 'Воскресный рынок' },
    attribution: 'Оригинальный текст (Courage), CC0.',
    fr: 'Le dimanche matin, nous allons au marché de la place. Il y a des légumes, des fruits et des fleurs. Ma femme choisit toujours les tomates les plus mûres. Le vendeur lui fait un bon prix parce qu’elle vient chaque semaine. Ensuite, nous prenons un café en terrasse et nous regardons les gens passer.',
    ru: 'В воскресенье утром мы идём на рынок на площади. Там есть овощи, фрукты и цветы. Моя жена всегда выбирает самые спелые помидоры. Продавец делает ей хорошую цену, потому что она приходит каждую неделю. Потом мы берём кофе на террасе и смотрим, как проходят люди.',
  },
  {
    id: 'train-paris',
    level: 'A2',
    title: { fr: 'Le train pour Paris', ru: 'Поезд в Париж' },
    attribution: 'Оригинальный текст (Courage), CC0.',
    fr: 'Nous prenons le train de huit heures pour Paris. La gare est pleine de monde. Je cherche notre voiture pendant que ma femme garde les valises. Le voyage dure deux heures. Par la fenêtre, on voit des champs, des villages et des rivières. À l’arrivée, il pleut, mais nous sommes contents d’être là.',
    ru: 'Мы садимся на восьмичасовой поезд в Париж. Вокзал полон людей. Я ищу наш вагон, пока жена стережёт чемоданы. Дорога занимает два часа. В окно видно поля, деревни и реки. По приезде идёт дождь, но мы рады, что добрались.',
  },
  {
    id: 'rendez-vous-medecin',
    level: 'B1',
    title: { fr: 'Le rendez-vous chez le médecin', ru: 'Приём у врача' },
    attribution: 'Оригинальный текст (Courage), CC0.',
    fr: 'Depuis une semaine, j’ai mal à l’épaule et je dors mal. La secrétaire m’a proposé un rendez-vous mardi à dix heures. Le médecin m’a demandé depuis quand la douleur avait commencé et si elle augmentait le soir. Il pense que ce n’est pas grave, mais il préfère que je fasse une radio. Si les résultats sont normaux, je devrai surtout me reposer et éviter de porter des choses lourdes.',
    ru: 'Уже неделю у меня болит плечо и я плохо сплю. Секретарь предложила мне приём во вторник в десять. Врач спросил, с какого времени началась боль и усиливается ли она вечером. Он думает, что это не серьёзно, но предпочитает, чтобы я сделал рентген. Если результаты будут нормальные, мне нужно будет главным образом отдыхать и не поднимать тяжёлое.',
  },
  {
    id: 'demenagement-france',
    level: 'B1',
    title: { fr: 'Le projet de déménagement', ru: 'Планы переезда' },
    attribution: 'Оригинальный текст (Courage), CC0.',
    fr: 'Depuis deux ans, nous parlons de nous installer en France. Ma femme apprend le français le soir, après le travail, même quand elle est fatiguée. Nous savons que ce sera difficile au début : les papiers, le logement, la langue. Mais nous préférons essayer plutôt que de regretter plus tard. Si tout se passe bien, nous partirons l’année prochaine.',
    ru: 'Уже два года мы говорим о том, чтобы перебраться во Францию. Моя жена учит французский по вечерам, после работы, даже когда устала. Мы знаем, что поначалу будет трудно: документы, жильё, язык. Но мы предпочитаем попробовать, чем потом жалеть. Если всё пройдёт хорошо, мы уедем в следующем году.',
  },
]

const SENT_RE = /(?<=[.!?…])\s+/

function splitSentences(s) {
  return s
    .trim()
    .split(SENT_RE)
    .map((x) => x.trim())
    .filter(Boolean)
}

// PCM (mono, 16-bit) → WAV
function pcmToWav(pcm, sampleRate) {
  const header = Buffer.alloc(44)
  const dataLen = pcm.length
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataLen, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28) // byte rate
  header.writeUInt16LE(2, 32) // block align
  header.writeUInt16LE(16, 34) // bits
  header.write('data', 36)
  header.writeUInt32LE(dataLen, 40)
  return Buffer.concat([header, pcm])
}

async function synthesize(text, worker) {
  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } },
      },
    },
  }
  const res = await fetch(`${worker}/v1beta/models/${TTS_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`TTS HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  const json = await res.json()
  const part = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
  if (!part) throw new Error('TTS: нет inlineData в ответе')
  const mime = part.inlineData.mimeType || 'audio/L16;rate=24000'
  const rate = Number(mime.match(/rate=(\d+)/)?.[1] ?? 24000)
  const pcm = Buffer.from(part.inlineData.data, 'base64')
  return { pcm, rate }
}

function sentenceStarts(frSentences, durationMs) {
  const lens = frSentences.map((s) => s.length)
  const total = lens.reduce((a, b) => a + b, 0) || 1
  const starts = []
  let acc = 0
  for (const l of lens) {
    starts.push(Math.round((acc / total) * durationMs))
    acc += l
  }
  return starts
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const worker = workerUrl()
  if (!worker) {
    console.error('Нет VITE_GEMINI_WORKER_URL (.env) и GEMINI_WORKER_URL — озвучки не будет.')
  }

  const index = []
  for (const src of SOURCES) {
    const fr = splitSentences(src.fr)
    const ru = splitSentences(src.ru)
    if (fr.length !== ru.length) {
      console.error(`✗ ${src.id}: fr ${fr.length} ≠ ru ${ru.length} предложений — пропуск`)
      continue
    }
    const sentences = fr.map((f, i) => ({ fr: f, ru: ru[i] }))

    let audio
    if (worker) {
      try {
        const { pcm, rate } = await synthesize(src.fr, worker)
        const wav = pcmToWav(pcm, rate)
        writeFileSync(resolve(OUT_DIR, `${src.id}.wav`), wav)
        const durationMs = Math.round((pcm.length / 2 / rate) * 1000)
        audio = {
          src: `/texts/${src.id}.wav`,
          sentenceStarts: sentenceStarts(fr, durationMs),
          durationMs,
        }
        console.log(`✓ ${src.id}: ${fr.length} предл., аудио ${(durationMs / 1000).toFixed(1)}с, ${(wav.length / 1024).toFixed(0)} КБ`)
      } catch (e) {
        console.error(`✗ ${src.id}: озвучка не удалась (${e.message}) — текст без аудио`)
      }
    }

    const doc = {
      id: src.id,
      title: src.title,
      level: src.level,
      source: 'curated',
      attribution: src.attribution,
      sentences,
      ...(audio ? { audio } : {}),
    }
    writeFileSync(resolve(OUT_DIR, `${src.id}.json`), JSON.stringify(doc, null, 2) + '\n')
    index.push({
      id: src.id,
      title: src.title,
      level: src.level,
      hasAudio: !!audio,
      ...(audio ? { durationSec: Math.round(audio.durationMs / 1000) } : {}),
    })
  }

  writeFileSync(resolve(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n')
  writeFileSync(
    resolve(OUT_DIR, 'LICENSE.txt'),
    'Тексты в public/texts/ — оригинальные (Courage), CC0.\n' +
      'Аудио сгенерировано Gemini TTS для учебного использования внутри приложения.\n',
  )
  console.log(`\nГотово: ${index.length} текстов, аудио у ${index.filter((e) => e.hasAudio).length}.`)
}

main()
