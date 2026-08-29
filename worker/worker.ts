/**
 * Courage — Cloudflare Worker-прокси для Gemini 1.5 Flash.
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

export interface Env {
  GEMINI_API_KEY: string
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
}