import { useEffect, useRef, useState } from 'react'
import type { LearningText, WordRecord } from '../lib/types'
import { loadText, sentenceIndexAt, tokenize, wordKey } from '../lib/texts'
import {
  loadDictionary,
  loadThemedDict,
  normFr,
  type DictEntry,
  type ThemedEntry,
} from '../lib/dictionary'
import { speakFr } from '../lib/speech'
import { AlertIcon, CloseIcon, SpeakerIcon } from '../lib/icons'

interface ReaderProps {
  id: string
  userWords: WordRecord[]
  onAddWord: (fr: string, ru: string) => void
  onClose: () => void
}

interface Gloss {
  key: string
  ru: string
  known: boolean
  loading: boolean
}

export function Reader({ id, userWords, onAddWord, onClose }: ReaderProps) {
  const [text, setText] = useState<LearningText | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound'>('loading')
  const [themed, setThemed] = useState<ThemedEntry[] | null>(null)
  const [wik, setWik] = useState<DictEntry[] | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [curSentence, setCurSentence] = useState(0)
  const [progress, setProgress] = useState(0)

  const [gloss, setGloss] = useState<Gloss | null>(null)
  const [activeWord, setActiveWord] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [shadow, setShadow] = useState(false) // бит антиципации: «повтори вслух»

  useEffect(() => {
    let alive = true
    setStatus('loading')
    loadText(id).then((t) => {
      if (!alive) return
      setText(t)
      setStatus(t ? 'ready' : 'notfound')
    })
    loadThemedDict().then((t) => alive && setThemed(t)).catch(() => {})
    return () => {
      alive = false
    }
  }, [id])

  const knownKeys = new Set(userWords.map((w) => normFr(w.fr)))

  const handleTimeUpdate = () => {
    const el = audioRef.current
    if (!el || !text?.audio) return
    const ms = el.currentTime * 1000
    setCurSentence(sentenceIndexAt(text.audio.sentenceStarts, ms))
    setProgress(el.duration ? el.currentTime / el.duration : 0)
  }

  const togglePlay = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }

  const handleWordTap = async (sKey: string, token: string) => {
    const key = wordKey(token)
    if (!key) return
    setActiveWord(sKey)

    const mine = userWords.find((w) => normFr(w.fr) === normFr(key))
    if (mine) {
      setGloss({ key, ru: mine.ru, known: true, loading: false })
      return
    }
    const t = themed?.find((e) => normFr(e.f) === normFr(key))
    if (t) {
      setGloss({ key, ru: t.r, known: false, loading: false })
      return
    }
    setGloss({ key, ru: '', known: false, loading: true })
    let dict = wik
    if (!dict) {
      try {
        dict = await loadDictionary()
        setWik(dict)
      } catch {
        dict = []
      }
    }
    const hit = dict.find((e) => normFr(e.f) === normFr(key))
    setGloss({ key, ru: hit?.r ?? '', known: false, loading: false })
  }

  const closeGloss = () => {
    setGloss(null)
    setActiveWord(null)
  }

  const addCurrentWord = () => {
    if (!gloss) return
    onAddWord(gloss.key, gloss.ru)
    setAdded((prev) => new Set(prev).add(normFr(gloss.key)))
    closeGloss()
  }

  return (
    <main className="screen reader">
      <header className="topbar">
        <p className="exercise-prompt muted" style={{ margin: 0 }}>
          {text ? `${text.level} · чтение` : 'чтение'}
        </p>
        <button
          type="button"
          className="btn btn-secondary btn-tight"
          onClick={onClose}
        >
          <CloseIcon />
          Хватит на сегодня
        </button>
      </header>

      {status === 'loading' && <p className="muted">Загружаю…</p>}
      {status === 'notfound' && (
        <p className="error">
          <AlertIcon />
          Текст не найден.
        </p>
      )}

      {text && (
        <>
          <div className="reader-scroll">
            <h1 className="screen-title serif" style={{ fontSize: 'var(--text-lg)' }}>
              {text.title.fr}
            </h1>
            <p className="muted" style={{ marginTop: 0 }}>{text.title.ru}</p>

            <p className="reader-text">
              {text.sentences.map((s, si) => (
                <span
                  key={si}
                  className={`reader-sentence${
                    text.audio && si === curSentence
                      ? ' reader-sentence--active'
                      : ''
                  }`}
                >
                  {tokenize(s.fr).map((tok, wi) => {
                    const sKey = `${si}:${wi}`
                    const nk = normFr(wordKey(tok))
                    const seen = nk && (knownKeys.has(nk) || added.has(nk))
                    return (
                      <span key={wi}>
                        <button
                          type="button"
                          className={`reader-word${seen ? ' reader-word--seen' : ''}${
                            activeWord === sKey ? ' reader-word--active' : ''
                          }`}
                          onClick={() => void handleWordTap(sKey, tok)}
                        >
                          {tok}
                        </button>{' '}
                      </span>
                    )
                  })}
                </span>
              ))}
            </p>

            {!text.audio && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  speakFr(text.sentences.map((s) => s.fr).join(' '))
                }
              >
                <SpeakerIcon />
                Озвучить текст
              </button>
            )}

            {gloss && (
              <div className="reader-gloss">
                <p className="reader-gloss-fr">
                  {gloss.key}
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label={`Озвучить: ${gloss.key}`}
                    onClick={() => speakFr(gloss.key)}
                  >
                    <SpeakerIcon />
                  </button>
                </p>
                <p className="muted" style={{ margin: 0 }}>
                  {gloss.loading
                    ? 'ищу перевод…'
                    : gloss.ru || 'перевода нет — можно всё равно добавить'}
                </p>
                <div className="reader-gloss-actions">
                  {gloss.known ? (
                    <span className="verdict verdict--ok">Уже в ваших словах</span>
                  ) : (
                    <button
                      type="button"
                      className="btn"
                      disabled={gloss.loading}
                      onClick={addCurrentWord}
                    >
                      В мои слова
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={closeGloss}
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            )}
          </div>

          {shadow && text.sentences.length > 0 && (
            <div className="reader-gloss">
              <p className="eyebrow">Повтори вслух</p>
              <p className="reader-gloss-fr" style={{ fontSize: 'var(--text-md)' }}>
                {text.sentences[text.sentences.length - 1].fr}
                <button
                  type="button"
                  className="btn-icon"
                  aria-label="Озвучить"
                  onClick={() =>
                    speakFr(text.sentences[text.sentences.length - 1].fr)
                  }
                >
                  <SpeakerIcon />
                </button>
              </p>
              <p className="muted" style={{ margin: 0 }}>
                {text.sentences[text.sentences.length - 1].ru}
              </p>
              <button
                type="button"
                className="btn"
                onClick={() => setShadow(false)}
              >
                Сказала
              </button>
            </div>
          )}

          {text.audio && (
            <>
              <audio
                ref={audioRef}
                src={text.audio.src}
                preload="auto"
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => {
                  setPlaying(false)
                  setProgress(1)
                }}
              />
              <div className="reader-bar">
                <button
                  type="button"
                  className="reader-play"
                  aria-label={playing ? 'Пауза' : 'Слушать'}
                  onClick={togglePlay}
                >
                  {playing ? <PauseGlyph /> : <PlayGlyph />}
                </button>
                <div className="reader-scrub" aria-hidden="true">
                  <span style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                {progress >= 0.85 && !shadow && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-tight"
                    onClick={() => setShadow(true)}
                  >
                    Повтори вслух
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </main>
  )
}

function PlayGlyph() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />
    </svg>
  )
}

function PauseGlyph() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" stroke="none" />
    </svg>
  )
}
