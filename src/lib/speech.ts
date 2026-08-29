// Минимальная озвучка французского через Web Speech API (встроен в Safari/iOS).

let cachedVoices: SpeechSynthesisVoice[] = []

function fillVoices(): void {
  if (!('speechSynthesis' in window)) return
  cachedVoices = window.speechSynthesis.getVoices()
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  fillVoices()
  window.speechSynthesis.onvoiceschanged = fillVoices
}

export function speakFr(text: string): void {
  if (!('speechSynthesis' in window)) return
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'fr-FR'
  const frVoice = cachedVoices.find((v) =>
    v.lang.toLowerCase().startsWith('fr'),
  )
  if (frVoice) utter.voice = frVoice
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utter)
}