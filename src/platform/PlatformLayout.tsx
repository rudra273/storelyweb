import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, Outlet } from 'react-router'
import { api } from '../api/client'
import { useAuth } from '../auth/context'
import { Alert, Loading } from '../components/ui'
import { Button } from '../components/workspace'
import { describeError } from '../components/useAction'
import './platform.css'

export function PlatformLayout() {
  const { user, logout } = useAuth()
  return <div className="platform-shell"><header className="platform-bar"><Link className="brand" to="/platform">Storely <span className="platform-badge">DEVELOPER</span></Link><span>{user?.email}</span><Button onClick={() => void logout()}>Sign out</Button></header>
    <nav className="platform-nav" aria-label="Developer console"><NavLink to="/platform" end>Overview</NavLink><NavLink to="/platform/requests">Premium requests</NavLink><NavLink to="/platform/shops">Shops</NavLink><NavLink to="/platform/history">Audit history</NavLink><NavLink to="/request-premium">Request Premium</NavLink><NavLink to="/platform/account/security">Account security</NavLink></nav><main className="platform-main"><Outlet /></main></div>
}

export function PlatformGate() {
  const access = useQuery({ queryKey: ['platform', 'access'], queryFn: () => api.get('/v1/platform/access'), retry: false, staleTime: 0, refetchOnMount: 'always' })
  if (access.isPending) return <Loading label="Checking developer access…" />
  if (access.isError) return <><h1>Developer access required</h1><Alert>{describeError(access.error)}</Alert><p>A shop owner or staff role does not grant developer access. An operator must provision your verified account. Enable two-factor authentication, then sign out and sign in again.</p><Link to="/platform/account/security">Account security</Link> <Button onClick={() => void access.refetch()}>Check again</Button></>
  return <Outlet />
}
