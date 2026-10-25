import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api } from '../api/client'
import { AuthLayout } from '../components/AuthLayout'
import { useAction } from '../components/useAction'
import { Alert, Field } from '../components/ui'

export function ResetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { busy, error, run, setError } = useAction()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password !== again) {
      setError('The two passwords do not match.')
      return
    }
    const ok = await run(async () => {
      await api.post('/v1/auth/password/reset', { email: email.trim(), code: code.trim(), new_password: password }, false)
      return true
    })
    if (ok) navigate('/login', { state: { message: 'Password changed. Sign in with the new one.' } })
  }

  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={submit} noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
        <Field label="New password" type="password" autoComplete="new-password" hint="At least 10 characters." value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Field label="Repeat new password" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
        <button className="primary" disabled={busy || code.length !== 6 || !password}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>
      <p className="links">
        <Link to="/login">Back to sign in</Link> · <Link to="/forgot">Send a new code</Link>
      </p>
    </AuthLayout>
  )
}
