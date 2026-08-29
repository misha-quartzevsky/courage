import { useState } from 'react'
import type { CefrLevel, ProgressState } from '../lib/types'
import {
  isBelowLevel,
  nextSession,
  sessionsForUnit,
  syllabusByLevel,
  unitProgress,
  type SyllabusSession,
  type SyllabusUnit,
} from '../lib/syllabus'
import { doneRuleIds } from '../lib/storage'
import { ArrowRightIcon, CheckIcon, ChevronIcon } from '../lib/icons'

interface CourseMapProps {
  progress: ProgressState | null
  level: CefrLevel
  onOpenSession: (s: SyllabusSession) => void
}

interface UnitRowProps {
  unit: SyllabusUnit
  doneR: Set<string>
  nextRuleId: string
  progress: ProgressState | null
  onOpenSession: (s: SyllabusSession) => void
}

function UnitRow({
  unit,
  doneR,
  nextRuleId,
  progress,
  onOpenSession,
}: UnitRowProps) {
  const [open, setOpen] = useState(false)
  const { done, total } = unitProgress(unit.id, doneR)
  const isDone = total > 0 && done === total
  const isPartial = done > 0 && done < total
  const hasNext = unit.ruleIds.includes(nextRuleId)
  const rec = progress?.units[unit.id]
  const sessions = sessionsForUnit(unit.id)

  return (
    <li>
      <button
        type="button"
        className={`unit-row${hasNext && !isDone ? ' unit-row--next' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronIcon className="icon chevron" />
        <span
          className={`unit-mark${
            isDone
              ? ' unit-mark--done'
              : hasNext
                ? ' unit-mark--next'
                : isPartial
                  ? ' unit-mark--partial'
                  : ''
          }`}
        >
          {isDone ? <CheckIcon /> : hasNext ? <ArrowRightIcon /> : null}
        </span>
        <span className="unit-label">
          <span className="unit-title-ru">
            <span className="unit-no">U{unit.unit}</span>
            <span className="unit-title-text">{unit.titleRu}</span>
          </span>
          <span className="unit-sub">{unit.titleFr}</span>
        </span>
        <span className="unit-frac">
          {isDone && rec ? (
            <>
              <CheckIcon /> {rec.bestAccuracy}%
            </>
          ) : (
            `${done}/${total}`
          )}
        </span>
      </button>

      {open && (
        <ul className="session-list">
          {sessions.map((s) => {
            const sDone = doneR.has(s.ruleId)
            const sNext = !sDone && s.ruleId === nextRuleId
            const srec = progress?.rules[s.ruleId]
            return (
              <li key={s.ruleId}>
                <button
                  type="button"
                  className={`session-row${sNext ? ' session-row--next' : ''}`}
                  onClick={() => onOpenSession(s)}
                >
                  <span
                    className={`session-mark${
                      sDone
                        ? ' session-mark--done'
                        : sNext
                          ? ' session-mark--next'
                          : ''
                    }`}
                  >
                    {sDone ? <CheckIcon /> : sNext ? <ArrowRightIcon /> : null}
                  </span>
                  <span className="session-label">
                    <span className="session-title-ru">{s.ruleTitleRu}</span>
                    <span className="session-sub">{s.ruleTitleFr}</span>
                  </span>
                  {sDone && srec && (
                    <span className="session-score">{srec.bestAccuracy}%</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

interface LevelSectionProps {
  group: { level: CefrLevel; units: SyllabusUnit[] }
  doneR: Set<string>
  nextRuleId: string
  below: boolean
  defaultOpen: boolean
  progress: ProgressState | null
  onOpenSession: (s: SyllabusSession) => void
}

function LevelSection({
  group,
  doneR,
  nextRuleId,
  below,
  defaultOpen,
  progress,
  onOpenSession,
}: LevelSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const doneCount = group.units.filter((u) => {
    const p = unitProgress(u.id, doneR)
    return p.total > 0 && p.done === p.total
  }).length
  const complete = doneCount === group.units.length

  return (
    <section className={`card${below ? ' card-dim' : ''}`}>
      <button
        type="button"
        className="level-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronIcon />
        <span className="level-name">Уровень {group.level}</span>
        <span className="course-count">
          {below ? (
            'ниже вашего уровня'
          ) : complete ? (
            <>
              <CheckIcon /> {group.units.length}/{group.units.length}
            </>
          ) : (
            `${doneCount}/${group.units.length}`
          )}
        </span>
      </button>

      {open && (
        <ul className="unit-list">
          {group.units.map((u) => (
            <UnitRow
              key={u.id}
              unit={u}
              doneR={doneR}
              nextRuleId={nextRuleId}
              progress={progress}
              onOpenSession={onOpenSession}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

export function CourseMap({ progress, level, onOpenSession }: CourseMapProps) {
  const doneR = doneRuleIds(progress)
  const ns = nextSession(doneR, level)
  const groups = syllabusByLevel()

  return (
    <div className="course-map">
      {groups.map((group) => {
        const below = isBelowLevel(group.units[0], level)
        const hasNext = group.units.some((u) => u.id === ns.unitId)
        return (
          <LevelSection
            key={group.level}
            group={group}
            doneR={doneR}
            nextRuleId={ns.ruleId}
            below={below}
            defaultOpen={group.level === level || hasNext}
            progress={progress}
            onOpenSession={onOpenSession}
          />
        )
      })}
    </div>
  )
}
