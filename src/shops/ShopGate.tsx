import { Link, Outlet } from 'react-router'
import { useAuth } from '../auth/context'
import { Alert, Loading } from '../components/ui'
import { Onboarding } from '../pages/Onboarding'
import { useShop } from './context'
import { AccessProvider } from '../subscriptions/AccessProvider'

/** Signed in, but a shop must be chosen (or created) before the main screens. */
export function ShopGate() {
  const { shops, current, loading, error, refresh } = useShop()
  const { logout } = useAuth()
  if (loading) return <Loading />
  if (error) {
    return (
      <main className="auth">
        <div className="auth-card">
          <Alert>{error.message}</Alert>
          <button className="primary" onClick={() => void refresh()}>Try again</button>
          <p><Link to="/account/security">Account security</Link></p>
          <button className="link" onClick={() => void logout()}>Sign out</button>
        </div>
      </main>
    )
  }
  if (shops.length === 0) {
    return (
      <div className="onboarding-shell">
        <header className="onboarding-header">
          <span className="brand">Storely<span className="onboarding-brand-dot" aria-hidden="true" /></span>
          <nav aria-label="Account" className="onboarding-account">
            <Link to="/account/security">Account security</Link>
            <button className="ui-button" onClick={() => void logout()}>Sign out</button>
          </nav>
        </header>
        <main className="onboarding-content"><Onboarding /></main>
      </div>
    )
  }
  return <AccessProvider key={`${current?.shop_id}:${current?.role}`}><Outlet /></AccessProvider>
}
