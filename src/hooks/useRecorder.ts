// useRecorder — запись микрофона средствами браузера (0 зависимостей).
// Внутри: MediaRecorder + AnalyserNode (живой уровень для аудиоволны),
// результат — Blob в base64 для отправки в Gemini.
// TODO(debt): заменить на нативный Capacitor Voice Recorder для iOS
// (см. Smell Inventory), когда заработает постоянная запись в фоне.

import { useCallback, useEffect, useRef, useState } from 'react'

export interface RecordedAudio {
  audioBase64: string
  mimeType: string
}

export interface UseRecorderResult {
  isRecording: boolean
  audioLevel: number // 0..1 — RMS уровня, для живой волны
  error: string | null
  start: () => Promise<void>
  stop: () => Promise<RecordedAudio | null>
}

export function useRecorder(): UseRecorderResult {
  const [isRecording, setRecording] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const analyserRef = useRef<AnalyserNode | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number>(0)
  const stopResolveRef = useRef<((blob: Blob) => void) | null>(null)

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (ctxRef.current && ctxRef.current.state !== 'closed') {
      void ctxRef.current.close()
    }
    ctxRef.current = null
    recRef.current = null
    analyserRef.current = null
    chunksRef.current = []
    cancelAnimationFrame(rafRef.current)
    setRecording(false)
    setAudioLevel(0)
  }, [])

  useEffect(() => cleanup, [cleanup])

  const levelLoop = useCallback((analyser: AnalyserNode) => {
    const data = new Uint8Array(analyser.fftSize)
    const compute = () => {
      if (!analyserRef.current) return
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128
        sum += v * v
      }
      // RMS × 3 — подкручено для заметной реакции амплитуды на голос
      setAudioLevel(Math.min(1, Math.sqrt(sum / data.length) * 3))
      rafRef.current = requestAnimationFrame(compute)
    }
    compute()
  }, [])

  const start = useCallback(async () => {
    if (recRef.current) return
    stopResolveRef.current = null
    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (Ctor) {
        const ctx = new Ctor()
        ctxRef.current = ctx
        // Safari: контекст создан до жеста пользователя, нужен resume
        if (ctx.state === 'suspended') await ctx.resume()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        ctx.createMediaStreamSource(stream).connect(analyser)
        analyserRef.current = analyser
        levelLoop(analyser)
      }

      const mime = MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : ''
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream)
      recRef.current = rec
      chunksRef.current = []

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || 'audio/webm',
        })
        stopResolveRef.current?.(blob)
        stopResolveRef.current = null
      }

      rec.start()
      setRecording(true)
    } catch (err) {
      console.error('[recorder]', err)
      cleanup()
      setError('Не удалось получить доступ к микрофону. Проверьте разрешения Safari.')
    }
  }, [cleanup, levelLoop])

  const stop = useCallback((): Promise<RecordedAudio | null> => {
    return new Promise((resolve) => {
      const rec = recRef.current
      if (!rec || rec.state === 'inactive') {
        resolve(null)
        return
      }

      stopResolveRef.current = (blob) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          const comma = result.indexOf(',')
          resolve({
            audioBase64: comma === -1 ? result : result.slice(comma + 1),
            mimeType: blob.type,
          })
          cleanup()
        }
        reader.onerror = () => {
          resolve(null)
          cleanup()
        }
        reader.readAsDataURL(blob)
      }

      rec.stop()
    })
  }, [cleanup])

  return { isRecording, audioLevel, error, start, stop }
}