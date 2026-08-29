import { useState, type FormEvent } from 'react'
import { sendMagicLink } from '../lib/supabase'
import { AlertIcon, CheckIcon } from '../lib/icons'

type Status = 'idle' | 'sending' | 'sent'

export function Login() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    setStatus('sending')
    setError(null)
    const res = await sendMagicLink(value)
    if (!res.ok) {
      console.error('sendMagicLink failed', res.error)
      setError(
        res.error
          ? `Не удалось отправить ссылку: ${res.error}`
          : 'Не удалось отправить ссылку. Проверьте адрес и попробуйте ещё раз.',
      )
      setStatus('idle')
      return
    }
    setStatus('sent')
  }

  if (status === 'sent') {
    return (
      <main className="screen screen-center">
        <section className="card card-raised login-card">
          <span className="verdict verdict--ok">
            <CheckIcon />
            Ссылка отправлена
          </span>
          <div className="score-verdict" style={{ margin: '12px 0 8px' }}>
            Проверьте почту
          </div>
          <p className="muted">
            Отправили ссылку для входа на <strong>{email.trim()}</strong>.
            Откройте её на этом устройстве — вернётесь в приложение уже
            авторизованным.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="screen screen-center">
      <div style={{ textAlign: 'left', width: '100%', maxWidth: 380 }}>
        <p className="eyebrow">Français pour deux</p>
        <h1 className="screen-title serif">Courage</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          Вход без пароля — ссылка придёт на почту.
        </p>
      </div>

      <section className="card login-card">
        <form className="text-form" onSubmit={handleSubmit}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            inputMode="email"
            required
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="vous@exemple.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="submit"
            className="btn"
            disabled={status === 'sending' || !email.trim()}
          >
            {status === 'sending' ? 'On envoie…' : 'Envoyer le lien'}
          </button>
        </form>
      </section>

      {error && (
        <p className="error login-card">
          <AlertIcon />
          {error}
        </p>
      )}
    </main>
  )
}
