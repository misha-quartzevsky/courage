/**
 * Service worker для веб-пушей. Кэширования/offline здесь нет — только
 * уведомления. Отправитель — Cloudflare Worker по Cron Trigger (worker/worker.ts).
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data && event.data.text() }
  }
  const title = payload.title || 'Courage'
  const options = {
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
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
