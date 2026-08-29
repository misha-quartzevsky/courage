// Регистрация service worker'а + тост «доступна новая версия».
// vite-plugin-pwa (registerType: 'prompt') сам не перезагружает — ждёт,
// пока пользователь нажмёт «Обновить».

import { registerSW } from 'virtual:pwa-register'

const HOUR = 60 * 60 * 1000

export function initPwaUpdates(): void {
  const updateSW = registerSW({
    onRegisteredSW(_swUrl, registration) {
      // Установленное приложение может висеть открытым сутками — проверяем сами.
      if (registration) {
        setInterval(() => void registration.update(), HOUR)
      }
    },
    onNeedRefresh() {
      showUpdateToast(() => void updateSW(true))
    },
  })
}

function showUpdateToast(onUpdate: () => void): void {
  if (document.querySelector('.pwa-toast')) return

  const el = document.createElement('div')
  el.className = 'pwa-toast'
  el.setAttribute('role', 'status')

  const text = document.createElement('span')
  text.textContent = 'Вышла новая версия'

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = 'Обновить'
  btn.addEventListener('click', () => {
    btn.disabled = true
    btn.textContent = 'Обновляю…'
    onUpdate()
  })

  el.append(text, btn)
  document.body.appendChild(el)
}
