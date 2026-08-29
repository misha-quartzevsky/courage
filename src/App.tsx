import { useCallback, useState } from 'react'
import type {
  CefrLevel,
  EvaluationVerdict,
  LearnerPersona,
  SprintExercise,
  SprintSession,
} from './lib/types'
import { generateSprint } from './lib/gemini'
import { loadProgress, recordCompletion } from './lib/storage'
import type { Mode } from './screens/Cockpit'
import { Cockpit } from './screens/Cockpit'
import { Sprint } from './screens/Sprint'
import { Debrief } from './screens/Debrief'

type Screen = 'cockpit' | 'sprint' | 'debrief'

export default function App() {
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

  const handleQuit = useCallback(() => {
    setSprint(null)
    setVerdicts([])
    setRetryExercises(null)
    setScreen('cockpit')
  }, [])

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

  return (
    <Cockpit
      persona={persona}
      level={level}
      mode={mode}
      loading={loading}
      error={aiError}
      streakDays={loadProgress()?.streakDays ?? 0}
      onPersona={setPersona}
      onLevel={setLevel}
      onMode={setMode}
      onStart={() => void handleStart()}
    />
  )
}