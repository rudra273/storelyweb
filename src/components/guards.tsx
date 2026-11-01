import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/context'
import { can, type Capability } from '../permissions'
import { useShop } from '../shops/context'
import { Alert, Loading } from './ui/ui'

/** Everything inside needs a signed-in visitor. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <Loading label="Starting…" />
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

/** Pages for signed-out visitors only (login, sign-up); signed-in visitors go home. */
export function PublicOnly() {
  const { status } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const destination = from?.startsWith('/') && !from.startsWith('//') ? from : '/'
  if (status === 'loading') return <Loading label="Starting…" />
  if (status === 'authenticated') return <Navigate to={destination} replace />
  return <Outlet />
}

/** Everything inside needs a role that holds the capability. */
export function RequireCapability({ needs }: { needs: Capability }) {
  const { role } = useShop()
  if (!can(role, needs)) {
    return (
      <div>
        <h1>No access</h1>
        <Alert kind="info">Your role in this shop does not include this page. Ask the shop owner if you need it.</Alert>
      </div>
    )
  }
  return <Outlet />
}
