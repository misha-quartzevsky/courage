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

  return {
    id: t.id,
    title: { fr: title.fr, ru: title.ru },
    level: t.level as CefrLevel,
    source: 'curated',
    attribution: t.attribution,
    sentences: t.sentences as { fr: string; ru: string }[],
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

export async function loadText(id: string): Promise<LearningText | null> {
  const hit = textMem.get(id)
  if (hit) return hit
  const res = await fetch(`/texts/${encodeURIComponent(id)}.json`)
  if (!res.ok) return null
  const parsed = parseLearningText(await res.json())
  if (parsed) textMem.set(id, parsed)
  return parsed
}
