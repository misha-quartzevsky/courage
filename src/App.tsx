import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type {
  CefrLevel,
  EvaluationVerdict,
  LearnerPersona,
  ProfessionId,
  SprintExercise,
  SprintSession,
  SupabaseProfile,
} from './lib/types'
import { generateSprint } from './lib/gemini'
import { PERSONAS } from './lib/personas'
import { loadProgress, recordCompletion } from './lib/storage'
import {
  getSession,
  loadPartnerStreak,
  loadProfile,
  onAuthChange,
  supabase,
  updateProfile,
} from './lib/supabase'
import type { Mode } from './screens/Cockpit'
import { Cockpit } from './screens/Cockpit'
import { Login } from './screens/Login'
import { Sprint } from './screens/Sprint'
import { Debrief } from './screens/Debrief'

type Screen = 'cockpit' | 'sprint' | 'debrief'

export default function App() {
  const [booted, setBooted] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<SupabaseProfile | null>(null)
  const [partnerStreak, setPartnerStreak] = useState<number | null>(null)

  const [screen, setScreen] = useState<Screen>('cockpit')
  const [persona, setPersona] = useState<LearnerPersona | null>(null)
  const [level, setLevel] = useState<CefrLevel>('A2')
  const [mode, setMode] = useState<Mode>('voice')
  const [sprint, setSprint] = useState<SprintSession | null>(null)
  const [retryExercises, setRetryExercises] = useState<SprintExercise[] | null>(
    null,
  )
  const [verdicts, setVerdicts] = useState<EvaluationVerdict[]>([])
  const [loading, setLoading] = useState(false)
  const [aiError, setAiError] = useState(false)

  // Применить сессию: загрузить профиль и стрик партнёра (один запрос).
  const applySession = useCallback(async (s: Session | null) => {
    setSession(s)
    if (!s) {
      setProfile(null)
      setPartnerStreak(null)
      setPersona(null)
      return
    }
    const p = await loadProfile()
    setProfile(p)
    if (p) {
      if (p.profession) {
        const persona = PERSONAS[p.profession as ProfessionId] ?? null
        if (persona) setPersona(persona)
      }
      if (p.target_level) setLevel(p.target_level)
      if (p.partner_id) {
        const ps = await loadPartnerStreak(p.partner_id)
        setPartnerStreak(ps)
      }
    }
  }, [])

  useEffect(() => {
    let active = true
    async function boot() {
      if (!supabase) {
        // Supabase не настроен (нет VITE_SUPABASE_URL/ANON_KEY) — демо-режим.
        if (active) setBooted(true)
        return
      }
      await applySession(await getSession())
      if (active) setBooted(true)
    }
    void boot()
    const unsub = onAuthChange((s) => void applySession(s))
    return () => {
      active = false
      unsub()
    }
  }, [applySession])

  // Запись профессии/уровня в Supabase при выборе в Cockpit.
  const handlePersona = useCallback(
    (p: LearnerPersona) => {
      setPersona(p)
      if (supabase) void updateProfile({ profession: p.id, target_level: level })
    },
    [level],
  )

  const handleLevel = useCallback(
    (l: CefrLevel) => {
      setLevel(l)
      if (supabase && persona) {
        void updateProfile({ profession: persona.id, target_level: l })
      }
    },
    [persona],
  )

  const handleStart = useCallback(async () => {
    if (!persona) return
    setLoading(true)
    setAiError(false)
    setRetryExercises(null)
    try {
      const s = await generateSprint(persona, level, sprint?.unitId)
      setSprint(s)
      setVerdicts([])
      setScreen('sprint')
    } catch {
      setScreen('cockpit')
      setAiError(true)
    } finally {
      setLoading(false)
    }
  }, [persona, level, sprint?.unitId])

  const handleFinish = useCallback(
    (vs: EvaluationVerdict[]) => {
      setVerdicts(vs)
      if (sprint) {
        const avg = vs.length
          ? Math.round(vs.reduce((a, v) => a + v.accuracy, 0) / vs.length)
          : 0
        recordCompletion(sprint.unitId, avg)
      }
      setScreen('debrief')
    },
    [sprint],
  )

  const handleRetry = useCallback(() => {
    if (!sprint) return
    const failed = sprint.exercises.filter(
      (ex) => !verdicts.find((v) => v.exerciseId === ex.id)?.passed,
    )
    setRetryExercises(failed.length > 0 ? failed : sprint.exercises)
    setVerdicts([])
    setScreen('sprint')
  }, [sprint, verdicts])

  // Перечитать профиль (после спринта стрик в Supabase обновился).
  const refreshProfile = useCallback(async () => {
    if (!session || !supabase) return
    const p = await loadProfile()
    setProfile(p)
    if (p?.partner_id) {
      const ps = await loadPartnerStreak(p.partner_id)
      setPartnerStreak(ps)
    }
  }, [session])

  const handleQuit = useCallback(() => {
    setSprint(null)
    setVerdicts([])
    setRetryExercises(null)
    void refreshProfile()
    setScreen('cockpit')
  }, [refreshProfile])

  if (screen === 'sprint' && sprint) {
    return (
      <Sprint
        sprint={sprint}
        exercises={retryExercises ?? sprint.exercises}
        mode={mode}
        onFinish={handleFinish}
        onQuit={handleQuit}
      />
    )
  }

  if (screen === 'debrief' && sprint) {
    return (
      <Debrief
        sprint={sprint}
        verdicts={verdicts}
        onRetry={handleRetry}
        onHome={handleQuit}
      />
    )
  }

  if (!booted) {
    return (
      <main className="screen">
        <p className="muted">Загрузка…</p>
      </main>
    )
  }

  // Авторизация прежде всего: нет сессии → экран входа.
  if (supabase && !session) {
    return <Login />
  }

  const streakDays =
    session !== null && profile !== null
      ? profile.streak_count
      : loadProgress()?.streakDays ?? 0

  return (
    <Cockpit
      persona={persona}
      level={level}
      mode={mode}
      loading={loading}
      error={aiError}
      streakDays={streakDays}
      partnerStreak={partnerStreak}
      onPersona={handlePersona}
      onLevel={handleLevel}
      onMode={setMode}
      onStart={() => void handleStart()}
    />
  )
}