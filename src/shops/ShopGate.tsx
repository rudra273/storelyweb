import { Outlet } from 'react-router'
import { useAuth } from '../auth/context'
import { Alert, Loading } from '../components/ui'
import { Onboarding } from '../pages/Onboarding'
import { useShop } from './context'

/** Signed in, but a shop must be chosen (or created) before the main screens. */
export function ShopGate() {
  const { shops, loading, error, refresh } = useShop()
  const { logout } = useAuth()
  if (loading) return <Loading />
  if (error) {
    return (
      <main className="auth">
        <div className="auth-card">
          <Alert>{error.message}</Alert>
          <button className="primary" onClick={() => void refresh()}>Try again</button>
          <button className="link" onClick={() => void logout()}>Sign out</button>
        </div>
      </main>
    )
  }
  if (shops.length === 0) {
    return (
      <main className="auth">
        <div className="auth-card wide">
          <Onboarding />
          <button className="link" onClick={() => void logout()}>Sign out</button>
        </div>
      </main>
    )
  }
  return <Outlet />
}
