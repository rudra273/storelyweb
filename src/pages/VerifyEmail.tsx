import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api } from '../api/client'
import { AuthLayout } from '../components/AuthLayout'
import { useAction } from '../components/useAction'
import { Alert, Field } from '../components/ui'

const RESEND_WAIT = 60

export function VerifyEmail() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [code, setCode] = useState('')
  const [wait, setWait] = useState(RESEND_WAIT)
  const [sent, setSent] = useState(false)
  const verify = useAction()
  const resend = useAction()

  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait(wait - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const ok = await verify.run(async () => {
      await api.post('/v1/auth/verify-email', { email: email.trim(), code: code.trim() }, false)
      return true
    })
    if (ok) navigate('/login', { state: { message: 'Email verified. You can sign in now.' } })
  }

  async function sendAgain() {
    const ok = await resend.run(async () => {
      await api.post('/v1/auth/resend-verification', { email: email.trim() }, false)
      return true
    })
    if (ok) {
      setSent(true)
      setWait(RESEND_WAIT)
    }
  }

  return (
    <AuthLayout title="Check your email">
      <p>We sent a 6-digit code to confirm your address. It works for 10 minutes.</p>
      <form onSubmit={submit} noValidate>
        {verify.error && <Alert>{verify.error}</Alert>}
        {resend.error && <Alert>{resend.error}</Alert>}
        {sent && !resend.error && <Alert kind="info">If that address has an account waiting, a new code is on its way.</Alert>}
        <Field label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]*" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus required />
        <button className="primary" disabled={verify.busy || code.length !== 6 || !email}>
          {verify.busy ? 'Checking…' : 'Verify email'}
        </button>
        <button type="button" className="link" disabled={wait > 0 || resend.busy || !email} onClick={sendAgain}>
          {wait > 0 ? `Send a new code (${wait}s)` : 'Send a new code'}
        </button>
      </form>
      <p className="links">
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthLayout>
  )
}
