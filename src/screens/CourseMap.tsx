import { useState } from 'react'
import type { CefrLevel, ProgressState } from '../lib/types'
import {
  isBelowLevel,
  nextUnit,
  syllabusByLevel,
  type SyllabusUnit,
} from '../lib/syllabus'
import { doneUnitIds } from '../lib/storage'
import { ArrowRightIcon, CheckIcon, ChevronIcon } from '../lib/icons'

interface CourseMapProps {
  progress: ProgressState | null
  level: CefrLevel
  onStartUnit: (u: SyllabusUnit) => void
}

interface LevelSectionProps {
  group: { level: CefrLevel; units: SyllabusUnit[] }
  done: Set<string>
  nextId: string
  below: boolean
  defaultOpen: boolean
  progress: ProgressState | null
  onStartUnit: (u: SyllabusUnit) => void
}

function LevelSection({
  group,
  done,
  nextId,
  below,
  defaultOpen,
  progress,
  onStartUnit,
}: LevelSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const doneCount = group.units.filter((u) => done.has(u.id)).length
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
          {group.units.map((u) => {
            const isDone = done.has(u.id)
            const isNext = !isDone && u.id === nextId
            const rec = progress?.units[u.id]
            return (
              <li key={u.id}>
                <button
                  type="button"
                  className={`unit-row${isNext ? ' unit-row--next' : ''}`}
                  onClick={() => onStartUnit(u)}
                >
                  <span
                    className={`unit-mark${
                      isDone
                        ? ' unit-mark--done'
                        : isNext
                          ? ' unit-mark--next'
                          : ''
                    }`}
                  >
                    {isDone ? (
                      <CheckIcon />
                    ) : isNext ? (
                      <ArrowRightIcon />
                    ) : null}
                  </span>
                  <span className="unit-label">
                    <span className="unit-text">
                      <span className="unit-title-ru">
                        <span className="unit-no">U{u.unit}</span>
                        {u.titleRu}
                      </span>
                      <span className="unit-sub">{u.titleFr}</span>
                    </span>
                  </span>
                  {isDone && rec && (
                    <span className="unit-score">{rec.bestAccuracy}%</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function CourseMap({ progress, level, onStartUnit }: CourseMapProps) {
  const done = doneUnitIds(progress)
  const next = nextUnit(done, level)
  const groups = syllabusByLevel()

  return (
    <div className="course-map">
      {groups.map((group) => {
        const below = isBelowLevel(group.units[0], level)
        const hasNext = group.units.some((u) => u.id === next.id)
        return (
          <LevelSection
            key={group.level}
            group={group}
            done={done}
            nextId={next.id}
            below={below}
            defaultOpen={group.level === level || hasNext}
            progress={progress}
            onStartUnit={onStartUnit}
          />
        )
      })}
    </div>
  )
}
