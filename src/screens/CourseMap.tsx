import type { ProgressState } from '../lib/types'
import {
  nextUnit,
  syllabusByLevel,
  type SyllabusUnit,
} from '../lib/syllabus'
import { doneUnitIds } from '../lib/storage'
import { ArrowRightIcon, CheckIcon } from '../lib/icons'

interface CourseMapProps {
  progress: ProgressState | null
  onStartUnit: (u: SyllabusUnit) => void
}

export function CourseMap({ progress, onStartUnit }: CourseMapProps) {
  const done = doneUnitIds(progress)
  const next = nextUnit(done)
  const groups = syllabusByLevel()

  return (
    <div className="course-map">
      {groups.map((group) => {
        const doneCount = group.units.filter((u) => done.has(u.id)).length
        return (
          <section className="card" key={group.level}>
            <h2>
              Parcours {group.level}
              <span className="course-count">
                {doneCount}/{group.units.length}
              </span>
            </h2>
            <ul className="unit-list">
              {group.units.map((u) => {
                const isDone = done.has(u.id)
                const isNext = !isDone && u.id === next.id
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
                        <span className="unit-no">U{u.unit}</span>
                        {u.titleFr}
                      </span>
                      {isDone && rec && (
                        <span className="unit-score">{rec.bestAccuracy}%</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
