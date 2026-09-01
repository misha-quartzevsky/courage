/// <reference lib="webworker" />
/**
 * Service worker: прекэш собранных ассетов (Workbox) + веб-пуши.
 * injectManifest — список файлов для прекэша подставляет vite-plugin-pwa
 * в self.__WB_MANIFEST. Обновление — по команде из приложения (SKIP_WAITING),
 * поэтому skipWaiting на install здесь НЕ вызываем.
 */
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>
}

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// SPA: любая навигация отдаётся из прекэшированного index.html.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// Встроенный словарь (~3,5 МБ) не в прекэше — грузится лениво при первом
// открытии вкладки «Словарь». Кэшируем cache-first, чтобы дальше работал офлайн.
const DICT_CACHE = 'courage-dict-v1'
registerRoute(
  ({ url }) => url.pathname === '/dict/fr-ru.json',
  async ({ request }) => {
    const cache = await caches.open(DICT_CACHE)
    const hit = await cache.match(request)
    if (hit) return hit
    const res = await fetch(request)
    if (res.ok) await cache.put(request, res.clone())
    return res
  },
)

// Приложение просит новую версию активироваться немедленно.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

// --- Веб-пуши (перенос из public/sw.js) ---

self.addEventListener('push', (event) => {
  let payload: {
    title?: string
    body?: string
    tag?: string
    url?: string
  } = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : undefined }
  }
  const title = payload.title || 'Courage'
  const options: NotificationOptions = {
    body: payload.body || 'Пора позаниматься французским.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'courage-reminder',
    renotify: true,
    data: { url: payload.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target =
    (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ('focus' in client) return client.focus()
        }
        return self.clients.openWindow(target)
      }),
  )
})
