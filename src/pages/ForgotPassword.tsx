import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../api/client'
import { AuthLayout } from '../components/AuthLayout'
import { useAction } from '../components/useAction'
import { Alert, Field } from '../components/ui'

export function ForgotPassword() {
  const navigate = useNavigate()
  const { busy, error, run } = useAction()
  const [email, setEmail] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const ok = await run(async () => {
      await api.post('/v1/auth/password/forgot', { email: email.trim() }, false)
      return true
    })
    // The server answers the same whether or not the address has an account.
    if (ok) navigate(`/reset?email=${encodeURIComponent(email.trim())}`)
  }

  return (
    <AuthLayout title="Reset your password">
      <p>Enter your email. If it belongs to an account, we send a 6-digit code.</p>
      <form onSubmit={submit} noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <button className="primary" disabled={busy || !email}>
          {busy ? 'Sending…' : 'Send code'}
        </button>
      </form>
      <p className="links">
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthLayout>
  )
}
