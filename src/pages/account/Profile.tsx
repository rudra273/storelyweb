import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { AccountHeader } from '../../components/AccountHeader'
import { api } from '../../api/client'
import { useAuth } from '../../auth/context'
import { useAction } from '../../components/useAction'
import { Alert, Card, Field } from '../../components/ui'

export function Profile() {
  const { user, reloadUser } = useAuth()
  const [name, setName] = useState(user?.full_name ?? '')
  const [saved, setSaved] = useState(false)
  const profile = useAction()

  const [newEmail, setNewEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const email = useAction()

  async function saveName(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    const ok = await profile.run(async () => {
      await api.patch('/v1/me', { full_name: name.trim() || null })
      await reloadUser()
      return true
    })
    if (ok) setSaved(true)
  }

  async function requestChange(e: FormEvent) {
    e.preventDefault()
    const ok = await email.run(async () => {
      await api.post('/v1/me/email', { new_email: newEmail.trim(), password })
      return true
    })
    if (ok) {
      setCodeSent(true)
      setPassword('')
    }
  }

  async function confirmChange(e: FormEvent) {
    e.preventDefault()
    const ok = await email.run(async () => {
      await api.post('/v1/me/email/confirm', { code: code.trim() })
      await reloadUser()
      return true
    })
    if (ok) {
      setCodeSent(false)
      setNewEmail('')
      setCode('')
    }
  }

  return (
    <div className="settings-page profile-page">
      <AccountHeader title="Profile" description="Manage your personal details and the email you use to sign in." />
      <div className="settings-grid">
      <Card title="Your details">
        <p className="setting-description">Your name appears across your workspace.</p>
        <form onSubmit={saveName} noValidate>
          {profile.error && <Alert>{profile.error}</Alert>}
          {saved && <Alert kind="success">Saved.</Alert>}
          <p>Email: <strong>{user?.email}</strong></p>
          <Field label="Name" value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} maxLength={100} />
          <button className="primary" disabled={profile.busy}>{profile.busy ? 'Saving…' : 'Save'}</button>
        </form>
      </Card>

      <Card title="Change email">
        <p className="setting-description">We’ll verify your new address before updating your sign-in email.</p>
        {email.error && <Alert>{email.error}</Alert>}
        {!codeSent ? (
          <form onSubmit={requestChange} noValidate>
            <Field label="New email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
            <Field label="Current password" hint="To confirm it is you." type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button className="primary" disabled={email.busy || !newEmail || !password}>Send code to the new address</button>
          </form>
        ) : (
          <form onSubmit={confirmChange} noValidate>
            <Alert kind="info">A 6-digit code was sent to the new address.</Alert>
            <Field label="Code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
            <button className="primary" disabled={email.busy || code.length !== 6}>Confirm new email</button>
          </form>
        )}
      </Card>
      </div><div className="danger-zone"><Card title="Delete account">
        <p className="muted">Permanently remove your account. <Link to="/delete-account">Delete my account</Link></p>
      </Card></div>
    </div>
  )
}
