import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../../api/client'
import { useAuth } from '../../auth/context'
import { AuthLayout } from '../../components/AuthLayout'
import { useAction } from '../../components/useAction'
import { Alert, Field } from '../../components/ui'
import { LoginForm } from '../LoginForm'

/**
 * Public page where anyone can ask for their account to be deleted (Google Play requires
 * a web address for this). Signing in first proves the request is theirs.
 */
export function DeleteAccount() {
  const { status, logout } = useAuth()
  const navigate = useNavigate()
  const { busy, error, run } = useAction()
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [ownedShops, setOwnedShops] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const ok = await run(async () => {
      await api.delete('/v1/me', { password, code: code.trim() || null, delete_owned_shops: ownedShops })
      return true
    })
    if (ok) {
      await logout()
      navigate('/login', { state: { message: 'Your account has been deleted.' } })
    }
  }

  return (
    <AuthLayout title="Delete your account">
      <p>
        This permanently deletes your Storely account and the sign-in details we hold for it. It cannot be undone.
        Data stored only on your phone is not affected.
      </p>
      {status === 'loading' && <p role="status">Loading…</p>}
      {status === 'anonymous' && (
        <>
          <p>Sign in first so we know the request is yours.</p>
          <LoginForm onNeedsVerification={() => navigate('/verify')} />
        </>
      )}
      {status === 'authenticated' && (
        <form onSubmit={submit} noValidate>
          {error && <Alert>{error}</Alert>}
          <Field label="Your password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Field label="Two-step code (only if you use one)" maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} />
          <label className="check">
            <input type="checkbox" checked={ownedShops} onChange={(e) => setOwnedShops(e.target.checked)} />
            Also delete the shops I own, with all their data
          </label>
          <label className="check">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I understand this cannot be undone
          </label>
          <button className="danger-button" disabled={busy || !password || !confirmed}>
            {busy ? 'Deleting…' : 'Delete my account'}
          </button>
          <p className="links"><Link to="/">Cancel</Link></p>
        </form>
      )}
    </AuthLayout>
  )
}
