import { useState, type FormEvent } from 'react'
import { sendLoginCode, verifyLoginCode } from '../lib/supabase'
import { AlertIcon, CheckIcon } from '../lib/icons'

type Status = 'idle' | 'sending' | 'sent' | 'verifying' | 'done'

export function Login() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  const requestCode = async (e: FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    setStatus('sending')
    setError(null)
    const res = await sendLoginCode(value)
    if (!res.ok) {
      console.error('sendLoginCode failed', res.error)
      setError(
        res.error
          ? `Не удалось отправить код: ${res.error}`
          : 'Не удалось отправить код. Проверьте адрес и попробуйте ещё раз.',
      )
      setStatus('idle')
      return
    }
    setStatus('sent')
  }

  const submitCode = async (e: FormEvent) => {
    e.preventDefault()
    const value = code.trim()
    if (value.length < 6) return
    setStatus('verifying')
    setError(null)
    const res = await verifyLoginCode(email.trim(), value)
    if (!res.ok) {
      setError(res.error ? `Неверный код: ${res.error}` : 'Неверный код.')
      setStatus('sent')
      return
    }
    // onAuthChange в App подхватит сессию и сменит экран.
    setStatus('done')
  }

  if (status === 'sent' || status === 'verifying' || status === 'done') {
    return (
      <main className="screen screen-center">
        <section className="card card-raised login-card">
          <span className="verdict verdict--ok">
            <CheckIcon />
            Код отправлен
          </span>
          <p className="muted" style={{ margin: '12px 0 8px' }}>
            Отправили код для входа на <strong>{email.trim()}</strong>. Введите
            6 цифр из письма здесь — не переходите по ссылке, иначе вход
            откроется в браузере, а не в приложении.
          </p>

          <form className="text-form" onSubmit={submitCode}>
            <label htmlFor="login-code">Код из письма</label>
            <input
              id="login-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              disabled={status === 'done'}
            />
            <button
              type="submit"
              className="btn"
              disabled={code.trim().length < 6 || status !== 'sent'}
            >
              {status === 'verifying'
                ? 'Проверяем…'
                : status === 'done'
                  ? 'Входим…'
                  : 'Войти'}
            </button>
          </form>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: 8 }}
            disabled={status === 'verifying' || status === 'done'}
            onClick={() => {
              setCode('')
              setError(null)
              setStatus('idle')
            }}
          >
            Другой адрес
          </button>

          {error && (
            <p className="error" style={{ marginTop: 12 }}>
              <AlertIcon />
              {error}
            </p>
          )}
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
          Вход без пароля — код придёт на почту.
        </p>
      </div>

      <section className="card login-card">
        <form className="text-form" onSubmit={requestCode}>
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
            {status === 'sending' ? 'On envoie…' : 'Envoyer le code'}
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
