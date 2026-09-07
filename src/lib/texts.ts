// Уровневые тексты для вкладки «Чтение» / ридера (пилон Lire/Écouter).
// Файлы public/texts/*.json собирает scripts/build-texts.mjs; аудио — Gemini TTS.
// Пословных таймингов нет — подсветка идёт по предложениям.

import type { CefrLevel, LearningText, TextListEntry } from './types'

const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2']

/** Разбить предложение на отображаемые токены (слова с прилипшей пунктуацией). */
export function tokenize(fr: string): string[] {
  return fr.split(/\s+/).filter(Boolean)
}

/** Токен → ключ для словаря: без ведущей/хвостовой пунктуации, нижний регистр. */
export function wordKey(token: string): string {
  return token
    .replace(/^[«»"'“”().,!?;:…—–-]+/, '')
    .replace(/[«»"'“”().,!?;:…—–-]+$/, '')
    .toLowerCase()
    .trim()
}

/** Нормализация для матча: нижний регистр, NFD, без диакритики (как dictionary.normFr). */
function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

/**
 * Найти перевод слова в глоссарии текста. Матч по `wordKey` + `norm`; при промахе —
 * дешёвые нормализации: снять хвостовой s/x (мн. ч.), снять французскую элизию
 * (j'/l'/d'/qu'/n'/s'/t'/c'/m'). Промах → null.
 */
export function glossLookup(
  gloss: { fr: string; ru: string }[] | undefined,
  token: string,
): string | null {
  if (!gloss || !gloss.length) return null
  const key = wordKey(token)
  if (!key) return null
  const map = new Map<string, string>()
  for (const g of gloss) map.set(norm(wordKey(g.fr)), g.ru)

  const tries = [key]
  const elided = key.replace(/^(j|l|d|qu|n|s|t|c|m)['’]/, '')
  if (elided !== key) tries.push(elided)
  if (/[sx]$/.test(key)) tries.push(key.slice(0, -1))
  if (/[sx]$/.test(elided) && elided !== key) tries.push(elided.slice(0, -1))

  for (const t of tries) {
    const hit = map.get(norm(t))
    if (hit) return hit
  }
  return null
}

/** Индекс активного предложения для момента ms (по началам предложений). */
export function sentenceIndexAt(starts: number[], ms: number): number {
  if (!starts.length) return 0
  let idx = 0
  for (let i = 0; i < starts.length; i++) {
    if (ms >= starts[i]) idx = i
    else break
  }
  return idx
}

function isSentenceArray(v: unknown): v is { fr: string; ru: string }[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every(
      (s) =>
        !!s &&
        typeof s === 'object' &&
        typeof (s as { fr: unknown }).fr === 'string' &&
        typeof (s as { ru: unknown }).ru === 'string',
    )
  )
}

/** Проверить форму LearningText из JSON; при несоответствии — null. */
export function parseLearningText(raw: unknown): LearningText | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  if (typeof t.id !== 'string' || !t.id) return null
  const title = t.title as { fr?: unknown; ru?: unknown } | undefined
  if (!title || typeof title.fr !== 'string' || typeof title.ru !== 'string') {
    return null
  }
  if (!LEVELS.includes(t.level as CefrLevel)) return null
  if (t.source !== 'curated') return null
  if (typeof t.attribution !== 'string') return null
  if (!isSentenceArray(t.sentences)) return null

  let audio: LearningText['audio']
  const a = t.audio as
    | { src?: unknown; sentenceStarts?: unknown; durationMs?: unknown }
    | undefined
  if (a && typeof a === 'object') {
    if (
      typeof a.src === 'string' &&
      Array.isArray(a.sentenceStarts) &&
      a.sentenceStarts.every((n) => typeof n === 'number') &&
      a.sentenceStarts.length === (t.sentences as unknown[]).length &&
      typeof a.durationMs === 'number'
    ) {
      audio = {
        src: a.src,
        sentenceStarts: a.sentenceStarts as number[],
        durationMs: a.durationMs,
      }
    }
  }

  const gloss = Array.isArray(t.gloss)
    ? (t.gloss.filter(
        (g) =>
          !!g &&
          typeof (g as { fr: unknown }).fr === 'string' &&
          typeof (g as { ru: unknown }).ru === 'string' &&
          (g as { fr: string }).fr.trim() &&
          (g as { ru: string }).ru.trim(),
      ) as { fr: string; ru: string }[])
    : undefined

  return {
    id: t.id,
    title: { fr: title.fr, ru: title.ru },
    level: t.level as CefrLevel,
    source: 'curated',
    attribution: t.attribution,
    sentences: t.sentences as { fr: string; ru: string }[],
    ...(gloss && gloss.length ? { gloss } : {}),
    ...(audio ? { audio } : {}),
  }
}

// --- Загрузка (память + fetch, зеркало dictionary.ts) ---

let listMem: TextListEntry[] | null = null
const textMem = new Map<string, LearningText>()

export async function loadTextList(): Promise<TextListEntry[]> {
  if (listMem) return listMem
  const res = await fetch('/texts/index.json')
  if (!res.ok) throw new Error(`texts index HTTP ${res.status}`)
  const raw = (await res.json()) as unknown
  listMem = Array.isArray(raw)
    ? (raw.filter(
        (e) =>
          !!e &&
          typeof (e as TextListEntry).id === 'string' &&
          LEVELS.includes((e as TextListEntry).level),
      ) as TextListEntry[])
    : []
  return listMem
}

// --- RFI «Journal en français facile»: разбор RSS (регэксп — работает и в node) ---

export interface RfiEpisode {
  title: string
  pageUrl: string
  audioUrl: string
  date: string
}

function unwrap(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .trim()
}

export function parseRfiFeed(xml: string): RfiEpisode[] {
  const out: RfiEpisode[] = []
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []
  for (const it of items) {
    const title = unwrap(it.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '')
    const link = unwrap(it.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? '')
    const guid = unwrap(it.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1] ?? '')
    const enc = it.match(/<enclosure\b[^>]*\burl=["']([^"']+)["']/i)?.[1] ?? ''
    const date = unwrap(it.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? '')
    const pageUrl = /^https?:/i.test(link) ? link : /^https?:/i.test(guid) ? guid : ''
    if (title && enc) {
      out.push({ title, pageUrl, audioUrl: enc, date })
    }
  }
  return out
}

export async function loadRfiEpisodes(workerUrl: string): Promise<RfiEpisode[]> {
  const base = workerUrl.replace(/\/+$/, '')
  const res = await fetch(`${base}/feed/rfi-jff`)
  if (!res.ok) throw new Error(`rfi feed HTTP ${res.status}`)
  return parseRfiFeed(await res.text()).slice(0, 12)
}

export async function loadText(id: string): Promise<LearningText | null> {
  const hit = textMem.get(id)
  if (hit) return hit
  const res = await fetch(`/texts/${encodeURIComponent(id)}.json`)
  if (!res.ok) return null
  const parsed = parseLearningText(await res.json())
  if (parsed) textMem.set(id, parsed)
  return parsed
}
