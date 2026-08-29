// Веб-пуши: регистрация service worker'а и подписка на Web Push.
// Плоский транспортный модуль рядом с supabase.ts. Подписка пишется прямо в
// таблицу push_subscriptions под RLS; рассылку по расписанию делает Cloudflare
// Worker (worker/worker.ts, обработчик scheduled).

import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined

export type PushState =
  | 'unsupported' // нет API (или iOS Safari без «на экран Домой»)
  | 'no-key' // не задан VITE_VAPID_PUBLIC_KEY
  | 'default' // API есть, разрешение ещё не спрашивали
  | 'denied' // пользователь запретил в системе
  | 'granted' // разрешение есть, но активной подписки нет
  | 'subscribed' // всё включено

export function isPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported'
  if (!VAPID_PUBLIC_KEY) return 'no-key'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'default') return 'default'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'subscribed' : 'granted'
}

// Запрос разрешения + подписка + сохранение. Вызывать только по тапу.
export async function enablePush(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported'
  if (!VAPID_PUBLIC_KEY) return 'no-key'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return permission === 'denied' ? 'denied' : 'default'
  }

  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))

  await saveSubscription(sub)
  return 'subscribed'
}

export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await deleteSubscription(sub.endpoint)
  await sub.unsubscribe()
}

// --- Supabase ---

async function saveSubscription(sub: PushSubscription): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.auth.getUser()
  const userId = data.user?.id
  if (!userId) return
  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      ua: navigator.userAgent,
    },
    { onConflict: 'endpoint' },
  )
  if (error) console.error('[push.save]', error)
}

async function deleteSubscription(endpoint: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
  if (error) console.error('[push.delete]', error)
}

// VAPID public key (base64url) → Uint8Array для applicationServerKey.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
