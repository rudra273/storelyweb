import { Link, Outlet } from 'react-router'
import { useAuth } from '../../auth/context'
import { Button } from '../ui/workspace'
/** Account recovery/security remains reachable without a shop or entitlement. */
export function AccountLayout() {
  const { user, logout } = useAuth()
  return <div><header className="workspace-header"><Link to="/">Storely workspace</Link><span>{user?.email}</span><Button onClick={() => void logout()}>Sign out</Button></header><main className="content"><Outlet /></main></div>
}
