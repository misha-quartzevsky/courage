import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type {
  CefrLevel,
  EvaluationVerdict,
  LearnerPersona,
  ProgressState,
  SprintExercise,
  SprintSession,
  SupabaseProfile,
} from './lib/types'
import { generateSprint } from './lib/gemini'
import { DEMO_PERSONA } from './lib/personas'
import { doneUnitIds, loadProgress, mergeServerProgress, recordCompletion } from './lib/storage'
import { nextUnit, type SyllabusUnit } from './lib/syllabus'
import {
  getSession,
  loadPartner,
  loadProfile,
  onAuthChange,
  supabase,
  updateProfile,
  type ProfilePatch,
} from './lib/supabase'
import type { Mode } from './screens/Cockpit'
import { Cockpit } from './screens/Cockpit'
import { Login } from './screens/Login'
import { Onboarding } from './screens/Onboarding'
import { Settings } from './screens/Settings'
import { Sprint } from './screens/Sprint'
import { Debrief } from './screens/Debrief'

type Screen = 'onboarding' | 'cockpit' | 'settings' | 'sprint' | 'debrief'

function personaFromProfile(p: SupabaseProfile | null): LearnerPersona | null {
  if (!p?.profession_text) return null
  return {
    professionFr: p.profession_text,
    interestsFr: p.interests ?? [],
    domainTags: p.domain_tags ?? [],
  }
}

export default function App() {
  const [booted, setBooted] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<SupabaseProfile | null>(null)
  const [partner, setPartner] = useState<{
    streakCount: number
    displayName: string | null
  } | null>(null)
  const [progress, setProgress] = useState<ProgressState | null>(null)

  const [screen, setScreen] = useState<Screen>('cockpit')
  const [persona, setPersona] = useState<LearnerPersona | null>(null)
  const [level, setLevel] = useState<CefrLevel>('A1')
  const [mode, setMode] = useState<Mode>('voice')
  const [sprint, setSprint] = useState<SprintSession | null>(null)
  const [retryExercises, setRetryExercises] = useState<SprintExercise[] | null>(
    null,
  )
  const [verdicts, setVerdicts] = useState<EvaluationVerdict[]>([])
  const [loading, setLoading] = useState(false)
  const [aiError, setAiError] = useState(false)

  // Применить сессию: профиль + партнёр + мерж прогресса с сервером.
  const applySession = useCallback(async (s: Session | null) => {
    setSession(s)
    if (!s) {
      setProfile(null)
      setPartner(null)
      setPersona(null)
      return
    }
    const p = await loadProfile()
    setProfile(p)
    setPersona(personaFromProfile(p))
    if (p?.target_level) setLevel(p.target_level)
    setPartner(p?.partner_id ? await loadPartner(p.partner_id) : null)
    setProgress(
      mergeServerProgress(p?.progress, p?.streak_count ?? 0, p?.best_accuracy ?? 0),
    )
    setScreen(p?.profession_text ? 'cockpit' : 'onboarding')
  }, [])

  useEffect(() => {
    let active = true
    async function boot() {
      if (!supabase) {
        // Демо-режим: нет логина → дефолтный контекст, прогресс из localStorage.
        if (active) {
          setPersona(DEMO_PERSONA)
          setProgress(loadProgress())
          setBooted(true)
        }
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

  const refreshProfile = useCallback(async () => {
    if (!session || !supabase) return
    const p = await loadProfile()
    setProfile(p)
    setPersona(personaFromProfile(p))
    if (p?.target_level) setLevel(p.target_level)
    setPartner(p?.partner_id ? await loadPartner(p.partner_id) : null)
    setProgress(
      mergeServerProgress(p?.progress, p?.streak_count ?? 0, p?.best_accuracy ?? 0),
    )
  }, [session])

  const saveProfilePatch = useCallback(
    async (patch: ProfilePatch) => {
      if (patch.target_level) setLevel(patch.target_level)
      if (
        patch.profession_text !== undefined ||
        patch.interests !== undefined ||
        patch.domain_tags !== undefined
      ) {
        setPersona((prev) => ({
          professionFr: patch.profession_text ?? prev?.professionFr ?? '',
          interestsFr: patch.interests ?? prev?.interestsFr ?? [],
          domainTags: patch.domain_tags ?? prev?.domainTags ?? [],
        }))
      }
      if (supabase) {
        await updateProfile(patch)
        await refreshProfile()
      }
    },
    [refreshProfile],
  )

  const startUnit = useCallback(
    async (unit: SyllabusUnit) => {
      if (!persona) return
      setLoading(true)
      setAiError(false)
      setRetryExercises(null)
      try {
        const s = await generateSprint(persona, level, unit)
        setSprint(s)
        setVerdicts([])
        setScreen('sprint')
      } catch {
        setScreen('cockpit')
        setAiError(true)
      } finally {
        setLoading(false)
      }
    },
    [persona, level],
  )

  const handleStartNext = useCallback(() => {
    void startUnit(nextUnit(doneUnitIds(progress)))
  }, [startUnit, progress])

  const handleFinish = useCallback(
    (vs: EvaluationVerdict[]) => {
      setVerdicts(vs)
      if (sprint) {
        const avg = vs.length
          ? Math.round(vs.reduce((a, v) => a + v.accuracy, 0) / vs.length)
          : 0
        setProgress(recordCompletion(sprint, avg))
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

  const handleQuit = useCallback(() => {
    setSprint(null)
    setVerdicts([])
    setRetryExercises(null)
    void refreshProfile()
    setScreen('cockpit')
  }, [refreshProfile])

  if (!booted) {
    return (
      <main className="screen screen-center">
        <h1 className="screen-title serif">Courage</h1>
        <span className="spinner" />
      </main>
    )
  }

  if (supabase && !session) return <Login />

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

  if (screen === 'onboarding') {
    return (
      <Onboarding
        initialLevel={level}
        onSave={async (p, lvl) => {
          setPersona(p)
          setLevel(lvl)
          setScreen('cockpit')
          await saveProfilePatch({
            profession_text: p.professionFr,
            interests: p.interestsFr,
            domain_tags: p.domainTags,
            target_level: lvl,
          })
        }}
      />
    )
  }

  if (screen === 'settings') {
    return (
      <Settings
        persona={persona}
        level={level}
        canSignOut={!!supabase}
        onSave={saveProfilePatch}
        onSignOut={() => void supabase?.auth.signOut()}
        onClose={() => setScreen('cockpit')}
      />
    )
  }

  const activeStreak =
    session && profile ? profile.streak_count : progress?.streakDays ?? 0

  return (
    <Cockpit
      persona={persona}
      level={level}
      mode={mode}
      loading={loading}
      error={aiError}
      streakDays={activeStreak}
      partnerStreak={partner?.streakCount ?? null}
      partnerName={partner?.displayName ?? null}
      userName={profile?.display_name ?? null}
      progress={progress}
      onMode={setMode}
      onStartNext={handleStartNext}
      onStartUnit={(u) => void startUnit(u)}
      onOpenSettings={() => setScreen('settings')}
    />
  )
}
