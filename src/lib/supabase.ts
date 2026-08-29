// Клиент Supabase: auth по magic link + профили + прогресс/стрик.
// Плоский транспортный модуль рядом с gemini.ts / storage.ts — без слоёв и портов.
// URL и anon key публичные, но лежат в .env, а не в коде.

import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'
import type { CefrLevel, ProfessionId, SupabaseProfile } from './types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined

export const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null

// --- Auth: magic link без пароля ---

export async function sendMagicLink(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) {
    return {
      ok: false,
      error: 'Supabase не настроен: укажите VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY',
    }
  }
  const { error } = await supabase.auth.signInWithOtp({ email })
  if (error) {
    console.error('[supabase.magicLink]', error)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function onAuthChange(cb: (session: Session | null) => void): () => void {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) =>
    cb(session),
  )
  return () => data.subscription.unsubscribe()
}

// --- Profiles ---

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export async function loadProfile(): Promise<SupabaseProfile | null> {
  if (!supabase) return null
  const userId = await currentUserId()
  if (!userId) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[supabase.loadProfile]', error)
    return null
  }
  return (data as SupabaseProfile | null) ?? null
}

export async function updateProfile(patch: {
  profession: ProfessionId
  target_level: CefrLevel
}): Promise<boolean> {
  if (!supabase) return false
  const userId = await currentUserId()
  if (!userId) return false
  const { error } = await supabase
    .from('profiles')
    .update({
      profession: patch.profession,
      target_level: patch.target_level,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
  if (error) {
    console.error('[supabase.updateProfile]', error)
    return false
  }
  return true
}

export async function updateProgress(progress: {
  streakDays: number
  bestAccuracy: number
  lastCompletedAt: string
}): Promise<boolean> {
  if (!supabase) return false
  const userId = await currentUserId()
  if (!userId) return false
  const { error } = await supabase
    .from('profiles')
    .update({
      streak_count: progress.streakDays,
      best_accuracy: progress.bestAccuracy,
      last_completed_at: progress.lastCompletedAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
  if (error) {
    console.error('[supabase.updateProgress]', error)
    return false
  }
  return true
}

// Стрик партнёра: один SELECT по partner_id при открытии Cockpit (без realtime).
export async function loadPartnerStreak(
  partnerId: string,
): Promise<number | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('streak_count')
    .eq('id', partnerId)
    .maybeSingle()
  if (error) {
    console.error('[supabase.partner]', error)
    return null
  }
  if (!data) return null
  return (data as { streak_count: number }).streak_count ?? null
}