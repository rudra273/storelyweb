import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../api/client'
import { AuthLayout } from '../components/AuthLayout'
import { useAction } from '../components/useAction'
import { Alert, Field } from '../components/ui'

export function Signup() {
  const navigate = useNavigate()
  const { busy, error, run, setError } = useAction()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password !== again) {
      setError('The two passwords do not match.')
      return
    }
    const ok = await run(async () => {
      await api.post('/v1/auth/signup', { email: email.trim(), password, full_name: name.trim() || null }, false)
      return true
    })
    if (ok) navigate(`/verify?email=${encodeURIComponent(email.trim())}`)
  }

  return (
    <AuthLayout title="Create your account">
      <form onSubmit={submit} noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Your name (optional)" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        <Field label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field label="Password" type="password" autoComplete="new-password" hint="At least 8 characters. Avoid common words and patterns." value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Field label="Repeat password" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
        <button className="primary" disabled={busy || !email || !password}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="links">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  )
}
