import { useState, type FormEvent } from 'react'
import { sendMagicLink } from '../lib/supabase'

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
      setError(res.error ?? 'Не удалось отправить ссылку')
      setStatus('idle')
      return
    }
    setStatus('sent')
  }

  if (status === 'sent') {
    return (
      <main className="screen">
        <header>
          <h1 className="app-title">Courage</h1>
        </header>
        <section className="card">
          <h2>Проверьте почту</h2>
          <p className="muted">
            Ссылка для входа отправлена на <strong>{email.trim()}</strong>.
            После перехода по ссылке вы вернётесь в приложение уже
            авторизованным.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="screen">
      <header>
        <h1 className="app-title">Courage</h1>
        <p className="muted">Вход без пароля — ссылка придёт на почту.</p>
      </header>

      <section className="card">
        <form className="text-form" onSubmit={handleSubmit}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            placeholder="vous@exemple.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="submit"
            className="btn"
            disabled={status === 'sending' || !email.trim()}
          >
            {status === 'sending' ? 'Отправка…' : 'Отправить ссылку'}
          </button>
        </form>
      </section>

      {error && <p className="error">{error}</p>}
    </main>
  )
}