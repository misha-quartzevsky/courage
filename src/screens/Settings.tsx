import { useEffect, useState } from 'react'
import type { CefrLevel, LearnerPersona } from '../lib/types'
import type { ProfilePatch } from '../lib/supabase'
import { availableLevels } from '../lib/syllabus'
import {
  disablePush,
  enablePush,
  getPushState,
  type PushState,
} from '../lib/push'

const LEVELS: CefrLevel[] = availableLevels()
const HOURS = [7, 8, 9, 12, 18, 19, 20, 21, 22]

interface SettingsProps {
  persona: LearnerPersona | null
  level: CefrLevel
  reminderHour: number
  reminderHourTo: number | null
  canSignOut: boolean
  onSave: (patch: ProfilePatch) => void | Promise<void>
  onSignOut: () => void
}

const toList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

export function Settings({
  persona,
  level,
  reminderHour,
  reminderHourTo,
  canSignOut,
  onSave,
  onSignOut,
}: SettingsProps) {
  const [profession, setProfession] = useState(persona?.professionFr ?? '')
  const [interests, setInterests] = useState(
    (persona?.interestsFr ?? []).join(', '),
  )
  const [tags, setTags] = useState((persona?.domainTags ?? []).join(', '))
  const [lvl, setLvl] = useState<CefrLevel>(level)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [push, setPush] = useState<PushState | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  useEffect(() => {
    void getPushState().then(setPush)
  }, [])

  const togglePush = async () => {
    if (pushBusy) return
    setPushBusy(true)
    try {
      if (push === 'subscribed') {
        await disablePush()
        setPush(await getPushState())
      } else {
        setPush(await enablePush())
      }
    } finally {
      setPushBusy(false)
    }
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    setSaved(false)
    await onSave({
      profession_text: profession.trim(),
      interests: toList(interests),
      domain_tags: toList(tags),
      target_level: lvl,
    })
    setSaving(false)
    setSaved(true)
  }

  return (
    <main className="screen">
      <header>
        <h1 className="app-title">Настройки</h1>
      </header>

      <section className="card">
        <h2>Профессия</h2>
        <div className="text-form">
          <input
            value={profession}
            onChange={(e) => setProfession(e.target.value)}
            placeholder="chirurgien vitréo-rétinien"
          />
        </div>
      </section>

      <section className="card">
        <h2>Интересы</h2>
        <div className="text-form">
          <input
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            placeholder="ski alpin, gastronomie, jeux de société"
          />
          <label>Через запятую.</label>
        </div>
      </section>

      <section className="card">
        <h2>Термины профессии</h2>
        <div className="text-form">
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="vitrectomie, décollement de la rétine"
          />
          <label>Через запятую. Идут в промпт для 30% персонализации.</label>
        </div>
      </section>

      <section className="card">
        <h2>Ваш уровень</h2>
        <div className="chips">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              className={`chip${lvl === l ? ' chip--active' : ''}`}
              onClick={() => setLvl(l)}
            >
              {l}
            </button>
          ))}
        </div>
        <p className="muted section-hint">
          С какого уровня начинается курс. Юниты ниже остаются доступны в карте.
        </p>
      </section>

      <section className="card">
        <h2>Напоминания</h2>
        {push === 'unsupported' && (
          <p className="muted section-hint">
            На iPhone уведомления работают, только если открыть сайт в Safari и
            добавить его на экран «Домой» (кнопка «Поделиться» → «На экран
            „Домой“»), а потом запускать уже оттуда.
          </p>
        )}
        {push === 'no-key' && (
          <p className="muted section-hint">
            Не настроен VAPID-ключ (VITE_VAPID_PUBLIC_KEY) — пуши пока недоступны.
          </p>
        )}
        {push === 'denied' && (
          <p className="muted section-hint">
            Уведомления запрещены в системе. Разрешите их для этого приложения в
            настройках телефона, затем вернитесь сюда.
          </p>
        )}
        {(push === 'default' ||
          push === 'granted' ||
          push === 'subscribed') && (
          <>
            <button
              type="button"
              className={`btn${push === 'subscribed' ? ' btn-secondary' : ''}`}
              disabled={pushBusy}
              onClick={() => void togglePush()}
            >
              {pushBusy
                ? 'Секунду…'
                : push === 'subscribed'
                  ? 'Выключить напоминания'
                  : 'Напоминать заниматься'}
            </button>
            {push === 'subscribed' && (
              <>
                <p className="muted section-hint">Присылать напоминание в:</p>
                <div className="chips">
                  <button
                    type="button"
                    className={`chip${
                      reminderHourTo != null ? ' chip--active' : ''
                    }`}
                    onClick={() =>
                      void onSave({ reminder_hour: 19, reminder_hour_to: 21 })
                    }
                  >
                    19–21, случайно
                  </button>
                  {HOURS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      className={`chip${
                        reminderHourTo == null && reminderHour === h
                          ? ' chip--active'
                          : ''
                      }`}
                      onClick={() =>
                        void onSave({ reminder_hour: h, reminder_hour_to: null })
                      }
                    >
                      {h}:00
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </section>

      <div className="spacer" />

      <button
        type="button"
        className="btn btn-lg"
        disabled={saving || !profession.trim()}
        onClick={save}
      >
        {saving ? 'Сохраняем…' : saved ? 'Сохранено ✓' : 'Сохранить'}
      </button>

      {canSignOut && (
        <button type="button" className="btn btn-secondary" onClick={onSignOut}>
          Выйти
        </button>
      )}
    </main>
  )
}
