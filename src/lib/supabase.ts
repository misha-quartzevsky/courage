// Клиент Supabase: auth по magic link + профили + прогресс/стрик.
// Плоский транспортный модуль рядом с gemini.ts / storage.ts — без слоёв и портов.
// URL и anon key публичные, но лежат в .env, а не в коде.

import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'
import type {
  CefrLevel,
  RuleRecord,
  SupabaseProfile,
  UnitRecord,
  WordRecord,
} from './types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined

export const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null

// --- Auth: вход по одноразовому коду (OTP) без пароля ---
//
// Именно код, а не magic-ссылка: ссылка из письма на iOS всегда открывается
// в Safari, а не в установленном PWA (у PWA отдельное хранилище сессии), поэтому
// в PWA вход по ссылке зависает навсегда. С кодом пользователь не уходит из
// приложения: ввёл 6 цифр — сессия легла в хранилище самого PWA.

export async function sendLoginCode(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) {
    return {
      ok: false,
      error: 'Supabase не настроен: укажите VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY',
    }
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  })
  if (error) {
    console.error('[supabase.sendLoginCode]', error)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function verifyLoginCode(
  email: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase не настроен' }
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: token.trim(),
    type: 'email',
  })
  if (error) {
    console.error('[supabase.verifyLoginCode]', error)
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

export interface ProfilePatch {
  profession_text?: string
  interests?: string[]
  domain_tags?: string[]
  target_level?: CefrLevel
  display_name?: string
  reminder_hour?: number
}

export async function updateProfile(patch: ProfilePatch): Promise<boolean> {
  if (!supabase) return false
  const userId = await currentUserId()
  if (!userId) return false
  const { error } = await supabase
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
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
  units: Record<string, UnitRecord>
  rules: Record<string, RuleRecord>
  words: WordRecord[]
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
      progress: {
        units: progress.units,
        rules: progress.rules,
        words: progress.words,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
  if (error) {
    console.error('[supabase.updateProgress]', error)
    return false
  }
  return true
}

// Партнёр: один SELECT по partner_id при открытии Cockpit (без realtime).
// Возвращаем стрик и имя — для бейджа «👥 Миша · 3 j».
export async function loadPartner(
  partnerId: string,
): Promise<{ streakCount: number; displayName: string | null } | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('streak_count, display_name')
    .eq('id', partnerId)
    .maybeSingle()
  if (error) {
    console.error('[supabase.partner]', error)
    return null
  }
  if (!data) return null
  const row = data as { streak_count: number; display_name: string | null }
  return { streakCount: row.streak_count ?? 0, displayName: row.display_name }
}