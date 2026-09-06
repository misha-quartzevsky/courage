import { useCallback, useEffect, useRef, useState } from 'react'
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
import { attachExamples, dedupeGloss } from './lib/glossary'
import { getRule, type GrammarRule } from './lib/grammar'
import { DEMO_PERSONA } from './lib/personas'
import {
  addSeenWord,
  consolidatedRuleIds,
  dueRules,
  dueWords,
  interleaveRules,
  loadProgress,
  mergeServerProgress,
  recordDrillComplete,
  recordLightSession,
  recordSessionCompletion,
  toggleWordLearned,
  weakRules,
} from './lib/storage'
import { loadDrillIndex } from './lib/drill'
import { loadTextList } from './lib/texts'
import {
  LEVEL_ACHIEVEMENT,
  levelComplete,
  nextSession,
  sessionByRuleId,
  unitById,
  type SyllabusSession,
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
import { LessonWarmup } from './screens/LessonWarmup'
import { LessonDrill } from './screens/LessonDrill'
import { Lire } from './screens/Lire'
import { Reader } from './screens/Reader'
import { Dictionary } from './screens/Dictionary'
import { GrammarCodex } from './screens/GrammarCodex'
import { TabBar, type Tab } from './screens/TabBar'
import { Sprint } from './screens/Sprint'
import { Debrief } from './screens/Debrief'

type Overlay =
  | 'onboarding'
  | 'warmup'
  | 'drill'
  | 'sprint'
  | 'debrief'
  | 'read'
  | 'codex'
  | null

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

  const [tab, setTab] = useState<Tab>('today')
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [persona, setPersona] = useState<LearnerPersona | null>(null)
  const [level, setLevel] = useState<CefrLevel>('A1')
  const [mode, setMode] = useState<Mode>('voice')
  const [sprint, setSprint] = useState<SprintSession | null>(null)
  const [openTextId, setOpenTextId] = useState<string | null>(null)
  const [drillRule, setDrillRule] = useState<{ ruleId: string; recheck: boolean } | null>(null)
  const [drillIds, setDrillIds] = useState<Set<string>>(new Set())
  const [activeSession, setActiveSession] = useState<{
    unit: SyllabusUnit
    rule: GrammarRule
  } | null>(null)
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
    setTab('today')
    setOverlay(p?.profession_text ? null : 'onboarding')
  }, [])

  const appliedUserId = useRef<string | null>(null)

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
      const s = await getSession()
      appliedUserId.current = s?.user?.id ?? null
      await applySession(s)
      if (active) setBooted(true)
    }
    void boot()
    void loadDrillIndex().then((ids) => active && setDrillIds(ids))
    // Вечерний режим: после 18:00 и до 6:00 — притушенные токены (styles.css).
    const applyTod = () => {
      const h = new Date().getHours()
      document.documentElement.dataset.tod = h >= 18 || h < 6 ? 'eve' : 'day'
    }
    applyTod()
    const todTimer = window.setInterval(applyTod, 15 * 60 * 1000)
    // Реагируем только на смену пользователя (вход/выход). TOKEN_REFRESHED и
    // повторный SIGNED_IN при возврате на вкладку не должны сбрасывать
    // навигацию и терять прогресс текущего спринта.
    const unsub = onAuthChange((s) => {
      const uid = s?.user?.id ?? null
      if (uid === appliedUserId.current) return
      appliedUserId.current = uid
      void applySession(s)
    })
    return () => {
      active = false
      window.clearInterval(todTimer)
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

  // Открыть сессию по правилу. A1 с готовым дриллом → дрилл-тренажёр форм;
  // остальное → лёгкий режим (разминка → Gemini-спринт).
  const openSession = useCallback(
    (s: SyllabusSession, recheck = false) => {
      const unit = unitById(s.unitId)
      const rule = getRule(s.ruleId)
      if (!unit || !rule) return
      if (rule.level === 'A1' && drillIds.has(rule.id)) {
        setDrillRule({ ruleId: rule.id, recheck })
        setOverlay('drill')
        return
      }
      setActiveSession({ unit, rule })
      setAiError(false)
      setRetryExercises(null)
      setOverlay('warmup')
    },
    [drillIds],
  )

  // Диплинк из пуш-напоминания: /?rule=<id> → сразу разминка этого правила.
  const deepLinked = useRef(false)
  useEffect(() => {
    if (deepLinked.current || !booted || !persona || overlay !== null) return
    deepLinked.current = true
    const id = new URLSearchParams(window.location.search).get('rule')
    if (!id) return
    window.history.replaceState(null, '', window.location.pathname)
    const s = sessionByRuleId(id)
    if (s) openSession(s)
  }, [booted, persona, overlay, openSession])

  const beginPractice = useCallback(async () => {
    if (!persona || !activeSession) return
    setLoading(true)
    setAiError(false)
    try {
      const priorBest = progress?.rules[activeSession.rule.id]?.bestAccuracy
      // Чередование: вплести 1–2 задания на ранее пройденные (слабые) правила.
      const interleave = interleaveRules(progress, activeSession.rule.id)
        .map((r) => getRule(r.ruleId))
        .filter((r): r is GrammarRule => !!r)
      const s = await generateSprint(
        persona,
        level,
        activeSession.unit,
        activeSession.rule,
        priorBest,
        interleave,
      )
      setSprint(s)
      setVerdicts([])
      setOverlay('sprint')
    } catch {
      setAiError(true)
    } finally {
      setLoading(false)
    }
  }, [persona, level, activeSession, progress])

  const handleStartNext = useCallback(() => {
    // Сначала — выученное правило, которому пора на круг-проверку; иначе новое.
    const due = dueRules(progress)[0]
    if (due) {
      const s = sessionByRuleId(due.ruleId)
      if (s) {
        openSession(s, true)
        return
      }
    }
    openSession(nextSession(consolidatedRuleIds(progress), level))
  }, [openSession, progress, level])

  const handleDrillFinish = useCallback(
    (opts: { rounds: number; selfLearned: boolean; cleanRound: boolean }) => {
      if (drillRule && (opts.rounds > 0 || opts.selfLearned)) {
        setProgress(recordDrillComplete(drillRule.ruleId, opts))
      }
      setDrillRule(null)
      setOverlay(null)
      void refreshProfile()
    },
    [drillRule, refreshProfile],
  )

  const handleCreditDay = useCallback(() => {
    setProgress(recordLightSession())
    void refreshProfile()
  }, [refreshProfile])

  // Чтение (пилон Lire). Зеркалит openSession → overlay.
  const openText = useCallback((tid: string) => {
    setOpenTextId(tid)
    setOverlay('read')
  }, [])

  const closeReader = useCallback(() => {
    // Почитала — засчитываем день как лёгкую сессию (как «На сегодня хватит»).
    setProgress(recordLightSession())
    setOpenTextId(null)
    setOverlay(null)
    void refreshProfile()
  }, [refreshProfile])

  const handleStartReading = useCallback(async () => {
    const list = await loadTextList().catch(() => [])
    if (list[0]) openText(list[0].id)
  }, [openText])

  const handleSeenWord = useCallback(
    (fr: string, ru: string) => {
      setProgress(addSeenWord(fr, ru, openTextId ? `text:${openTextId}` : ''))
    },
    [openTextId],
  )

  const handleToggleWord = useCallback((fr: string, ru?: string) => {
    setProgress(toggleWordLearned(fr, ru))
  }, [])

  const startRevision = useCallback(async () => {
    if (!persona) return
    setLoading(true)
    setAiError(false)
    try {
      const words = dueWords(progress)
      const weakRec = weakRules(progress)[0]
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

  // Диплинк из пуша про просроченные слова: /?revision=1 → сразу Повторение.
  const deepLinkedRevision = useRef(false)
  useEffect(() => {
    if (deepLinkedRevision.current || !booted || !persona || overlay !== null) return
    const wants = new URLSearchParams(window.location.search).get('revision')
    if (!wants) return
    deepLinkedRevision.current = true
    window.history.replaceState(null, '', window.location.pathname)
    void startRevision()
  }, [booted, persona, overlay, startRevision])

  const handleFinish = useCallback(
    (vs: EvaluationVerdict[]) => {
      setVerdicts(vs)
      if (sprint) {
        const avg = vs.length
          ? Math.round(vs.reduce((a, v) => a + v.accuracy, 0) / vs.length)
          : 0
        const words = attachExamples(
          dedupeGloss([
            ...(sprint.glossary ?? []),
            ...vs.flatMap((v) => v.learnedWords),
          ]),
          sprint.exercises,
          sprint.reading,
        )
        // Французские слова упражнения двигают расписание SRS — и в повторении,
        // и в обычном спринте (верный ответ на choice/gap/match = повторение
        // слова, sla-methods.md). dialogue/order/transform/comprehension не
        // трогают расписание (там нет чёткого «слова-ответа»).
        const wordsOfVerdict = (v: EvaluationVerdict): string[] => {
          const ex = sprint.exercises.find((e) => e.id === v.exerciseId)
          if (!ex) return []
          if (ex.kind === 'match') return ex.pairs.map((p) => p.fr)
          if (ex.kind === 'choice') return [ex.promptFr]
          if (ex.kind === 'gap') return ex.blanks.map((b) => b.answer)
          return []
        }
        const masteredFr = vs.filter((v) => v.passed).flatMap(wordsOfVerdict)
        const missedFr = vs.filter((v) => !v.passed).flatMap(wordsOfVerdict)
        const before = consolidatedRuleIds(progress)
        const nextProgress = recordSessionCompletion(
          sprint.ruleId
            ? {
                ruleId: sprint.ruleId,
                unitId: sprint.unitId,
                level: sprint.level,
                ruleTitleFr: sprint.ruleTitleFr,
              }
            : null,
          avg,
          words,
          masteredFr,
          missedFr,
        )
        setProgress(nextProgress)
        const lvl = sprint.level
        const justCompleted =
          !sprint.revision &&
          levelComplete(lvl, consolidatedRuleIds(nextProgress)) &&
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
    setActiveSession(null)
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
        next={
          sprint.revision
            ? null
            : nextSession(consolidatedRuleIds(progress), level)
        }
        onRetry={handleRetry}
        onHome={handleQuit}
      />
    )
  }

  if (overlay === 'warmup' && activeSession) {
    return (
      <LessonWarmup
        rule={activeSession.rule}
        loading={loading}
        error={aiError}
        onStartPractice={() => void beginPractice()}
        onEnough={handleQuit}
        onCreditDay={handleCreditDay}
        onClose={() => setOverlay(null)}
      />
    )
  }

  if (overlay === 'drill' && drillRule) {
    return (
      <LessonDrill
        ruleId={drillRule.ruleId}
        recheck={drillRule.recheck}
        onFinish={handleDrillFinish}
      />
    )
  }

  if (overlay === 'read' && openTextId) {
    return (
      <Reader
        id={openTextId}
        userWords={progress?.words ?? []}
        onAddWord={handleSeenWord}
        onClose={closeReader}
      />
    )
  }

  if (overlay === 'codex') {
    return <GrammarCodex onClose={() => setOverlay(null)} />
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

  const revWeak = weakRules(progress)[0]
  const revDue = dueWords(progress).length
  const revisionReady = (progress?.words.length ?? 0) >= 8 || !!revWeak

  return (
    <div className="tabbed-root">
      {tab === 'today' && (
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
          onOpenSession={openSession}
          onStartReading={handleStartReading}
          onOpenCodex={() => setOverlay('codex')}
          onEnough={handleCreditDay}
        />
      )}
      {tab === 'lire' && <Lire onOpenText={openText} />}
      {tab === 'mots' && (
        <Dictionary
          userWords={progress?.words ?? []}
          onToggle={handleToggleWord}
          revisionReady={revisionReady}
          dueCount={revDue}
          weakTitle={revWeak?.titleFr}
          revisionLoading={loading}
          onStartRevision={() => void startRevision()}
        />
      )}
      {tab === 'profil' && (
        <Settings
          persona={persona}
          level={level}
          reminderHour={profile?.reminder_hour ?? 19}
          reminderHourTo={profile?.reminder_hour_to ?? null}
          canSignOut={!!supabase}
          onSave={saveProfilePatch}
          onSignOut={() => void supabase?.auth.signOut()}
        />
      )}
      <TabBar tab={tab} onTab={setTab} />
    </div>
  )
}
