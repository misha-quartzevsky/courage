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
import { generateRevision, generateSprint } from './lib/gemini'
import { DEMO_PERSONA } from './lib/personas'
import {
  doneUnitIds,
  loadProgress,
  mergeServerProgress,
  recordCompletion,
  weakUnits,
} from './lib/storage'
import {
  LEVEL_ACHIEVEMENT,
  levelComplete,
  nextUnit,
  unitById,
  type SyllabusUnit,
} from './lib/syllabus'
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
import { LessonIntro } from './screens/LessonIntro'
import { GrammarCodex } from './screens/GrammarCodex'
import { Revision } from './screens/Revision'
import { TabBar, type Tab } from './screens/TabBar'
import { Sprint } from './screens/Sprint'
import { Debrief } from './screens/Debrief'

type Overlay = 'onboarding' | 'lesson' | 'sprint' | 'debrief' | null

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

  const [tab, setTab] = useState<Tab>('cours')
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [persona, setPersona] = useState<LearnerPersona | null>(null)
  const [level, setLevel] = useState<CefrLevel>('A1')
  const [mode, setMode] = useState<Mode>('voice')
  const [sprint, setSprint] = useState<SprintSession | null>(null)
  const [activeUnit, setActiveUnit] = useState<SyllabusUnit | null>(null)
  const [retryExercises, setRetryExercises] = useState<SprintExercise[] | null>(
    null,
  )
  const [verdicts, setVerdicts] = useState<EvaluationVerdict[]>([])
  const [milestone, setMilestone] = useState<{
    level: CefrLevel
    text: string
  } | null>(null)
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
    setTab('cours')
    setOverlay(p?.profession_text ? null : 'onboarding')
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

  // Открыть юнит: сперва введение в тему, практика — уже оттуда.
  const openUnit = useCallback((unit: SyllabusUnit) => {
    setActiveUnit(unit)
    setAiError(false)
    setRetryExercises(null)
    setOverlay('lesson')
  }, [])

  const beginPractice = useCallback(async () => {
    if (!persona || !activeUnit) return
    setLoading(true)
    setAiError(false)
    try {
      const priorBest = progress?.units[activeUnit.id]?.bestAccuracy
      const s = await generateSprint(persona, level, activeUnit, priorBest)
      setSprint(s)
      setVerdicts([])
      setOverlay('sprint')
    } catch {
      setAiError(true)
    } finally {
      setLoading(false)
    }
  }, [persona, level, activeUnit, progress])

  const handleStartNext = useCallback(() => {
    openUnit(nextUnit(doneUnitIds(progress), level))
  }, [openUnit, progress, level])

  const startRevision = useCallback(async () => {
    if (!persona) return
    setLoading(true)
    setAiError(false)
    try {
      const words = progress?.words ?? []
      const weakRec = weakUnits(progress)[0]
      const weak = weakRec ? unitById(weakRec.unitId) : undefined
      const s = await generateRevision(persona, words, weak)
      setSprint(s)
      setVerdicts([])
      setOverlay('sprint')
    } catch {
      setAiError(true)
    } finally {
      setLoading(false)
    }
  }, [persona, progress])

  const handleFinish = useCallback(
    (vs: EvaluationVerdict[]) => {
      setVerdicts(vs)
      if (sprint) {
        const avg = vs.length
          ? Math.round(vs.reduce((a, v) => a + v.accuracy, 0) / vs.length)
          : 0
        const words = vs.flatMap((v) => v.learnedWords)
        const before = doneUnitIds(progress)
        const nextProgress = recordCompletion(sprint, avg, words)
        setProgress(nextProgress)
        const lvl = sprint.level
        const justCompleted =
          !sprint.revision &&
          levelComplete(lvl, doneUnitIds(nextProgress)) &&
          !levelComplete(lvl, before)
        setMilestone(
          justCompleted ? { level: lvl, text: LEVEL_ACHIEVEMENT[lvl] } : null,
        )
      }
      setOverlay('debrief')
    },
    [sprint, progress],
  )

  const handleRetry = useCallback(() => {
    if (!sprint) return
    const failed = sprint.exercises.filter(
      (ex) => !verdicts.find((v) => v.exerciseId === ex.id)?.passed,
    )
    setRetryExercises(failed.length > 0 ? failed : sprint.exercises)
    setVerdicts([])
    setOverlay('sprint')
  }, [sprint, verdicts])

  const handleQuit = useCallback(() => {
    setSprint(null)
    setActiveUnit(null)
    setVerdicts([])
    setRetryExercises(null)
    setMilestone(null)
    void refreshProfile()
    setOverlay(null)
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

  // --- Полноэкранные потоки (без таб-бара) ---

  if (overlay === 'sprint' && sprint) {
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

  if (overlay === 'debrief' && sprint) {
    return (
      <Debrief
        sprint={sprint}
        verdicts={verdicts}
        milestone={milestone}
        next={sprint.revision ? null : nextUnit(doneUnitIds(progress), level)}
        onRetry={handleRetry}
        onHome={handleQuit}
      />
    )
  }

  if (overlay === 'lesson' && activeUnit) {
    return (
      <LessonIntro
        unit={activeUnit}
        loading={loading}
        error={aiError}
        onStart={() => void beginPractice()}
        onSkip={() => void beginPractice()}
        onClose={() => setOverlay(null)}
      />
    )
  }

  if (overlay === 'onboarding') {
    return (
      <Onboarding
        initialLevel={level}
        onSave={async (p, lvl) => {
          setPersona(p)
          setLevel(lvl)
          setOverlay(null)
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

  // --- Вкладки ---

  const activeStreak =
    session && profile ? profile.streak_count : progress?.streakDays ?? 0

  return (
    <div className="tabbed-root">
      {tab === 'cours' && (
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
          onStartUnit={openUnit}
        />
      )}
      {tab === 'revision' && (
        <Revision
          progress={progress}
          loading={loading}
          error={aiError}
          onStart={() => void startRevision()}
        />
      )}
      {tab === 'codex' && <GrammarCodex />}
      {tab === 'profil' && (
        <Settings
          persona={persona}
          level={level}
          canSignOut={!!supabase}
          onSave={saveProfilePatch}
          onSignOut={() => void supabase?.auth.signOut()}
        />
      )}
      <TabBar tab={tab} onTab={setTab} />
    </div>
  )
}
