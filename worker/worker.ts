/**
 * Courage — Cloudflare Worker-прокси для Gemini (актуальная модель через
 * алиас *-latest, см. MODEL в src/lib/gemini.ts).
 *
 *
 * Зачем: Google геоблокирует API по IP из России. Запрос уходит с серверов
 * Cloudflare (не блокируются), а не напрямую с клиента.
 *
 * Ключ хранится ТОЛЬКО как секрет Worker'а:
 *   wrangler secret put GEMINI_API_KEY
 * Фронтенд ключ не видит и не передаёт. Входящий query-параметр `key`
 * игнорируется даже если вдруг попадёт от клиента.
 *
 * Это чисто транспортный слой: тело запроса и ответа Gemini проходят
 * без изменений (доменные типы/схемы JSON не трогаются).
 */

import { buildPushPayload } from '@block65/webcrypto-web-push'

export interface Env {
  GEMINI_API_KEY: string
  // Пуш-напоминания (обработчик scheduled). Все — секреты Worker'а.
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  VAPID_SUBJECT?: string // mailto:...
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

const UPSTREAM = 'https://generativelanguage.googleapis.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-goog-api-key',
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight: браузер шлёт OPTIONS перед POST с application/json
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
    }

    if (!env.GEMINI_API_KEY) {
      return new Response('GEMINI_API_KEY is not set', {
        status: 500,
        headers: corsHeaders,
      })
    }

    const url = new URL(request.url)

    // Проксируем только вызовы Gemini API — не превращаем worker в открытый прокси
    if (!url.pathname.startsWith('/v1beta/')) {
      return new Response('Not Found', { status: 404, headers: corsHeaders })
    }

    // Принимаем оригинальное тело от фронтенда как есть
    const body = await request.text()

    // Собираем целевой URL на Google, отбрасывая клиентский `key`
    const target = new URL(UPSTREAM)
    target.pathname = url.pathname
    url.searchParams.forEach((value, key) => {
      if (key !== 'key') target.searchParams.set(key, value)
    })

    // Форвардим, добавляя ключ заголовком (а не URL-параметром)
    const upstream = await fetch(target.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY,
      },
      body,
    })

    // Зеркалим статус и тело обратно клиенту + CORS
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type':
          upstream.headers.get('Content-Type') ?? 'application/json',
        ...corsHeaders,
      },
    })
  },

  // Cron Trigger (см. wrangler.toml → [triggers].crons): раз в час проверяем,
  // у кого сейчас наступил час напоминания и кто ещё не занимался сегодня, —
  // и шлём таким веб-пуш.
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await sendReminders(env)
  },
}

// --- Пуш-напоминания ---

interface ProfileRow {
  user_id: string
  reminder_hour: number | null
  last_notified_on: string | null
  last_completed_at: string | null
  streak_count: number | null
}

interface SubRow {
  endpoint: string
  p256dh: string
  auth: string
}

// Пользователей двое, оба в часовом поясе Европа/Париж — храним только час
// (reminder_hour), таймзону не спрашиваем, а берём фиксированную.
const TZ = 'Europe/Paris'

function partsInTz(d: Date): { hour: number; ymd: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  })
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]))
  return {
    hour: Number(p.hour) % 24,
    ymd: `${p.year}-${p.month}-${p.day}`,
  }
}

async function sendReminders(env: Env): Promise<void> {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env
  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !env.VAPID_PUBLIC_KEY ||
    !env.VAPID_PRIVATE_KEY ||
    !env.VAPID_SUBJECT
  ) {
    console.error('[push] секреты не заданы — пропускаем рассылку')
    return
  }

  const rest = `${SUPABASE_URL}/rest/v1`
  const sbHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }

  const now = new Date()
  const { hour, ymd: today } = partsInTz(now)

  const profiles: ProfileRow[] = await fetch(
    `${rest}/profiles?select=user_id,reminder_hour,last_notified_on,last_completed_at,streak_count`,
    { headers: sbHeaders },
  ).then((r) => r.json())

  const dueNow = profiles.filter((p) => {
    const rh = p.reminder_hour ?? 19
    if (rh !== hour) return false
    if (p.last_notified_on === today) return false // уже слали сегодня
    const studiedToday =
      p.last_completed_at && partsInTz(new Date(p.last_completed_at)).ymd === today
    return !studiedToday
  })
  if (dueNow.length === 0) return

  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  }

  for (const profile of dueNow) {
    const subs: SubRow[] = await fetch(
      `${rest}/push_subscriptions?select=endpoint,p256dh,auth&user_id=eq.${profile.user_id}`,
      { headers: sbHeaders },
    ).then((r) => r.json())

    const streak = profile.streak_count ?? 0
    const body =
      streak > 1
        ? `Серия ${streak} дней — не прерывай. 5 минут французского сейчас.`
        : 'Пора позаниматься французским. Спринт на 5 минут.'

    let delivered = 0
    for (const sub of subs) {
      const subscription = {
        endpoint: sub.endpoint,
        expirationTime: null,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }
      try {
        const payload = await buildPushPayload(
          { data: { title: 'Courage', body, url: '/' }, options: { ttl: 43200 } },
          subscription,
          vapid,
        )
        const res = await fetch(sub.endpoint, {
          method: payload.method,
          headers: payload.headers,
          body: payload.body as unknown as BodyInit,
        })
        if (res.status === 404 || res.status === 410) {
          await fetch(
            `${rest}/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
            { method: 'DELETE', headers: sbHeaders },
          )
        } else if (res.ok) {
          delivered++
        } else {
          console.error('[push] push service', res.status, await res.text())
        }
      } catch (e) {
        console.error('[push] send failed', e)
      }
    }

    if (delivered > 0) {
      await fetch(`${rest}/profiles?user_id=eq.${profile.user_id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ last_notified_on: today }),
      })
    }
  }
}