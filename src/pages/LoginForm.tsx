import { useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/context'
import { useAction } from '../components/useAction'
import { Alert, Field } from '../components/ui'

/** Email + password, then the second step when the account has two-factor on. */
export function LoginForm({ onNeedsVerification, onDone }: { onNeedsVerification: (email: string) => void; onDone?: () => void }) {
  const { login, completeMfa } = useAuth()
  const { busy, error, run, setError } = useAction()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaToken, setMfaToken] = useState<string | null>(null)
  const [code, setCode] = useState('')

  async function submitCredentials(e: FormEvent) {
    e.preventDefault()
    await run(async () => {
      try {
        const next = await login(email.trim(), password)
        if (next) {
          setMfaToken(next.mfaToken)
          setPassword('') // no longer needed; do not keep it around
        } else onDone?.()
      } catch (err) {
        if (err instanceof ApiError && err.code === 'email_not_verified') {
          onNeedsVerification(email.trim())
          return
        }
        throw err
      }
    })
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault()
    if (!mfaToken) return
    const ok = await run(async () => {
      await completeMfa(mfaToken, code.trim())
      return true
    })
    if (ok) onDone?.()
  }

  if (mfaToken) {
    return (
      <form onSubmit={submitCode} noValidate>
        <p>Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
        {error && <Alert>{error}</Alert>}
        <Field label="Code" autoComplete="one-time-code" inputMode="text" maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} autoFocus required />
        <button className="primary" disabled={busy || code.trim().length < 6}>
          {busy ? 'Checking…' : 'Verify'}
        </button>
        <button type="button" className="link" onClick={() => { setMfaToken(null); setCode(''); setError(null) }}>
          Start over
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={submitCredentials} noValidate>
      {error && <Alert>{error}</Alert>}
      <Field label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <button className="primary" disabled={busy || !email || !password}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
