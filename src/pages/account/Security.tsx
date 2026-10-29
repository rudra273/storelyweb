import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { QRCodeSVG } from 'qrcode.react'
import { AccountHeader } from '../../components/AccountHeader'
import { api, setAccessToken } from '../../api/client'
import type { MfaSetup, MfaStatus, SecurityEvent, Session } from '../../api/types'
import { useAuth } from '../../auth/context'
import { useAction } from '../../components/useAction'
import { Alert, Card, Field, Loading } from '../../components/ui'
import { when } from '../../components/format'

export function Security() {
  return (
    <div className="settings-page security-page">
      <AccountHeader title="Security" description="Protect your account and stay in control of where you’re signed in." />
      <div className="settings-grid">
      <PasswordCard />
      <TwoFactorCard />
      <SessionsCard />
      </div><div className="settings-activity"><ActivityCard /></div>
    </div>
  )
}

function PasswordCard() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [done, setDone] = useState(false)
  const { busy, error, run, setError } = useAction()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setDone(false)
    if (next !== again) {
      setError('The two new passwords do not match.')
      return
    }
    const out = await run(() => api.post<{ access_token: string }>('/v1/me/password', { current_password: current, new_password: next }))
    if (out) {
      // Other devices were signed out; this one continues with a fresh token.
      setAccessToken(out.access_token)
      setCurrent('')
      setNext('')
      setAgain('')
      setDone(true)
    }
  }

  return (
    <Card title="Password">
      <p className="setting-description">Use a unique password. Changing it signs out your other devices.</p>
      <form onSubmit={submit} noValidate>
        {error && <Alert>{error}</Alert>}
        {done && <Alert kind="success">Password changed. Your other devices were signed out.</Alert>}
        <Field label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        <Field label="New password" type="password" autoComplete="new-password" hint="At least 8 characters." value={next} onChange={(e) => setNext(e.target.value)} required />
        <Field label="Repeat new password" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
        <button className="primary" disabled={busy || !current || !next}>Change password</button>
      </form>
    </Card>
  )
}

function TwoFactorCard() {
  const queryClient = useQueryClient()
  const status = useQuery({ queryKey: ['mfa'], queryFn: () => api.get<MfaStatus>('/v1/me/mfa') })
  const [setup, setSetup] = useState<MfaSetup | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [disabling, setDisabling] = useState(false)
  const action = useAction()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['mfa'] })

  async function start() {
    const out = await action.run(() => api.post<MfaSetup>('/v1/me/mfa/setup'))
    if (out) setSetup(out)
  }
  async function enable(e: FormEvent) {
    e.preventDefault()
    const out = await action.run(() => api.post<{ recovery_codes: string[] }>('/v1/me/mfa/enable', { code: code.trim() }))
    if (out) {
      setCodes(out.recovery_codes)
      setSetup(null)
      setCode('')
      await refresh()
    }
  }
  async function disable(e: FormEvent) {
    e.preventDefault()
    const ok = await action.run(async () => {
      await api.post('/v1/me/mfa/disable', { password, code: code.trim() })
      return true
    })
    if (ok) {
      setDisabling(false)
      setPassword('')
      setCode('')
      await refresh()
    }
  }

  return (
    <Card title="Two-step sign-in">
      <p className="setting-description">Add a second layer of protection with an authenticator app.</p>
      {status.isPending && <Loading />}
      {status.error && <Alert>Could not load this setting. <button className="link" onClick={() => void status.refetch()}>Retry setting</button></Alert>}
      {action.error && <Alert>{action.error}</Alert>}

      {codes && (
        <div>
          <Alert kind="success">Two-step sign-in is on. Save these recovery codes now: each works once if you lose your phone. They will not be shown again.</Alert>
          <pre className="codes" aria-label="Recovery codes">{codes.join('\n')}</pre>
          <button className="primary" onClick={() => setCodes(null)}>I have saved them</button>
        </div>
      )}

      {!codes && status.data && !status.data.enabled && !setup && (
        <div>
          <p>Add a second step: a 6-digit code from an authenticator app each time you sign in.</p>
          <button className="primary" onClick={start} disabled={action.busy}>Set up</button>
        </div>
      )}

      {setup && (
        <form onSubmit={enable} noValidate>
          <p>In your authenticator app, add an account and scan this QR code. Then enter the 6-digit code it shows.</p>
          <div className="authenticator-qr">
            <QRCodeSVG value={setup.otpauth_uri} size={224} level="M" marginSize={4} bgColor="#ffffff" fgColor="#000000" role="img" aria-label="Authenticator setup QR code" title="Scan with your authenticator app" />
          </div>
          <p className="muted">Can’t scan? Add a time-based account manually using this setup key.</p>
          <pre className="codes" aria-label="Setup key">{setup.secret}</pre>
          <Field label="6-digit code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus />
          <button className="primary" disabled={action.busy || code.length !== 6}>Turn on</button>
          <button type="button" className="link" onClick={() => { setSetup(null); setCode('') }}>Cancel</button>
        </form>
      )}

      {!codes && status.data?.enabled && !disabling && (
        <div>
          <p>Two-step sign-in is <strong>on</strong>. Recovery codes left: {status.data.recovery_codes_remaining}.</p>
          <button className="danger-button" onClick={() => setDisabling(true)}>Turn off</button>
        </div>
      )}

      {disabling && (
        <form onSubmit={disable} noValidate>
          <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Field label="Code from your app (or a recovery code)" maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} required />
          <button className="danger-button" disabled={action.busy || !password || code.trim().length < 6}>Turn off two-step sign-in</button>
          <button type="button" className="link" onClick={() => setDisabling(false)}>Cancel</button>
        </form>
      )}
    </Card>
  )
}

function SessionsCard() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { logout } = useAuth()
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<Session[]>('/v1/me/sessions') })
  const action = useAction()

  async function revoke(s: Session) {
    const ok = await action.run(async () => {
      await api.delete(`/v1/me/sessions/${s.id}`)
      return true
    })
    if (!ok) return
    if (s.current) {
      await logout()
      navigate('/login')
    } else await queryClient.invalidateQueries({ queryKey: ['sessions'] })
  }

  async function everywhere() {
    if (!window.confirm('Sign out of every device, including this one?')) return
    const ok = await action.run(async () => {
      await api.post('/v1/auth/logout-all')
      return true
    })
    if (ok) {
      await logout()
      navigate('/login')
    }
  }

  return (
    <Card title="Where you are signed in">
      {sessions.isPending && <Loading />}
      {sessions.error && <Alert>Could not load your sessions. <button className="link" onClick={() => void sessions.refetch()}>Retry sessions</button></Alert>}
      {action.error && <Alert>{action.error}</Alert>}
      <ul className="plain">
        {sessions.data?.map((s) => (
          <li key={s.id} className="row">
            <span>
              <strong>{s.device_label || s.client}</strong> {s.current && <span className="badge">this device</span>}
              <br />
              <small className="muted">Last active {when(s.last_used_at)}{s.ip ? ` · ${s.ip}` : ''}</small>
            </span>
            <button className="link danger" onClick={() => revoke(s)} disabled={action.busy}>{s.current ? 'Sign out' : 'Revoke'}</button>
          </li>
        ))}
      </ul>
      <button className="danger-button" onClick={everywhere} disabled={action.busy}>Sign out everywhere</button>
    </Card>
  )
}

function ActivityCard() {
  const events = useQuery({ queryKey: ['my-events'], queryFn: () => api.get<SecurityEvent[]>('/v1/me/security-events') })
  return (
    <Card title="Recent security activity">
      {events.isPending && <Loading />}
      {events.error && <Alert>Could not load activity. <button className="link" onClick={() => void events.refetch()}>Retry activity</button></Alert>}
      {events.data?.length === 0 && <p className="muted">Nothing yet.</p>}
      {!!events.data?.length && (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>When</th><th>What</th><th>From</th></tr></thead>
          <tbody>
            {events.data.map((e) => (
              <tr key={e.id}><td>{when(e.created_at)}</td><td>{e.event.replaceAll('_', ' ')}</td><td>{e.ip ?? '—'}</td></tr>
            ))}
          </tbody>
        </table></div>
      )}
    </Card>
  )
}
