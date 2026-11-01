import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../auth/context'
import { AuthLayout } from '../../components/layout/AuthLayout'
import { Alert } from '../../components/ui/ui'
import { LoginForm } from './LoginForm'

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { notice, clearNotice } = useAuth()
  const state = location.state as { from?: string; message?: string } | null
  const from = state?.from && state.from.startsWith('/') && !state.from.startsWith('//') ? state.from : '/'

  return (
    <AuthLayout title="Sign in">
      {state?.message && <Alert kind="success">{state.message}</Alert>}
      {notice && <Alert kind="info">{notice}</Alert>}
      <LoginForm
        onNeedsVerification={(email) => navigate(`/verify?email=${encodeURIComponent(email)}`)}
        onDone={() => {
          clearNotice()
          navigate(from, { replace: true })
        }}
      />
      <p className="links">
        <Link to="/forgot">Forgot password?</Link> · <Link to="/signup">Create an account</Link>
      </p>
    </AuthLayout>
  )
}
