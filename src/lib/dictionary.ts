// Встроенный французско-русский словарь (~68k слов, WikDict / CC BY-SA 3.0).
// Файл public/dict/fr-ru.json не в прекэше PWA — грузится лениво при первом
// открытии вкладки «Словарь», затем лежит в IndexedDB и в кэше service worker.

export interface DictEntry {
  f: string // французское слово
  r: string // переводы через «; »
}

/** Нормализация для поиска и сопоставления со словами ученика. */
export function normFr(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

// --- Кэш в памяти ---
let memCache: DictEntry[] | null = null
let inflight: Promise<DictEntry[]> | null = null

// --- Мини-обёртка над IndexedDB (один ключ) ---
const IDB_DB = 'courage-dict'
const IDB_STORE = 'kv'
const IDB_KEY = 'fr-ru'

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(): Promise<DictEntry[] | null> {
  const db = await openIdb()
  try {
    return await new Promise<DictEntry[] | null>((resolve, reject) => {
      const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY)
      req.onsuccess = () => resolve((req.result as DictEntry[] | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

async function idbSet(value: DictEntry[]): Promise<void> {
  const db = await openIdb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(value, IDB_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** Загрузить словарь: память → IndexedDB → сеть. Бросает при ошибке сети. */
export async function loadDictionary(): Promise<DictEntry[]> {
  if (memCache) return memCache
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const stored = await idbGet()
      if (stored && stored.length) {
        memCache = stored
        return stored
      }
    } catch {
      /* приватный режим / нет IndexedDB — грузим из сети каждый раз */
    }

    const res = await fetch('/dict/fr-ru.json')
    if (!res.ok) throw new Error(`dictionary HTTP ${res.status}`)
    const data = (await res.json()) as DictEntry[]
    memCache = data
    try {
      await idbSet(data)
    } catch {
      /* не критично */
    }
    return data
  })()

  try {
    return await inflight
  } finally {
    inflight = null
  }
}

/**
 * Поиск: сначала совпадения по началу слова, затем по подстроке, затем по
 * переводу. Не более `limit` результатов.
 */
export function searchDictionary(
  all: DictEntry[],
  query: string,
  limit = 100,
): DictEntry[] {
  const n = normFr(query)
  if (!n) return all.slice(0, limit)
  const ql = query.trim().toLowerCase()

  const prefix: DictEntry[] = []
  const infix: DictEntry[] = []
  const trans: DictEntry[] = []
  for (const e of all) {
    const f = normFr(e.f)
    if (f.startsWith(n)) prefix.push(e)
    else if (f.includes(n)) infix.push(e)
    else if (e.r.toLowerCase().includes(ql)) trans.push(e)
  }
  return [...prefix, ...infix, ...trans].slice(0, limit)
}
