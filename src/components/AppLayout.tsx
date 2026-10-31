import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/context'
import { NAV, can } from '../permissions'
import { useShop } from '../shops/context'
import { useShopAccess } from '../subscriptions/context'

export function AppLayout() {
  const { user, logout } = useAuth()
  const { shops, current, role, select } = useShop()
  const { active, pending } = useShopAccess()
  const navigate = useNavigate()
  const location = useLocation()
  const page = NAV.find(item => location.pathname.startsWith(item.to))?.label ?? (location.pathname.startsWith('/account') ? 'Your account' : location.pathname === '/subscription' ? 'Cloud subscription' : 'Overview')
  const [open, setOpen] = useState(false)
  const items = active || pending ? NAV.filter((item) => can(role, item.needs)) : []

  return (
    <div className="shell"><a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar" data-open={open}>
        <div className="sidebar-top">
          <span className="brand"><img className="brand-mark" src="/storely-icon.png" alt="" /><span>Store<span className="brand-accent">ly</span></span><span className="brand-dot">.</span></span>
          <button className="menu-toggle" aria-expanded={open} aria-controls="workspace-navigation" onClick={() => setOpen(!open)}>
            Menu
          </button>
        </div>
        <div className="sidebar-body" id="workspace-navigation"><div className="shop-context"><span className="nav-caption">WORKSPACE</span>
          {shops.length > 1 ? (
            <label className="shop-switch">
              <span>Shop</span>
              <select aria-label="Shop" value={current?.shop_id ?? ''} onChange={(e) => select(e.target.value)}>
                {shops.map((s) => (
                  <option key={s.shop_id} value={s.shop_id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="shop-name">{current?.name}</p>
          )}
          {role && <p className="role-badge">{role}</p>}
          </div><span className="nav-caption">MANAGE</span><nav aria-label="Main">
            <NavLink to="/" end onClick={() => setOpen(false)}>
              <NavIcon path="/" />Home
            </NavLink>
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)}>
                <NavIcon path={item.to} />{item.label}
              </NavLink>
            ))}
            <NavLink to="/subscription" onClick={() => setOpen(false)}>Cloud subscription</NavLink>
          </nav>
          <nav aria-label="Account" className="account-nav">
            <NavLink to="/account" onClick={() => setOpen(false)}>
              <span className="account-avatar" aria-hidden="true">{(user?.full_name || user?.email || 'S').slice(0, 1).toUpperCase()}</span><span className="account-name">{user?.full_name || user?.email}<small>Account settings</small></span>
            </NavLink>
            <button
              className="link"
              onClick={async () => {
                await logout()
                navigate('/login')
              }}
            >
              Sign out
            </button>
          </nav>
        </div>
      </aside>
      <div className="workspace"><header className="workspace-header"><span>Workspace <span className="breadcrumb-divider">/</span> <strong>{page}</strong></span><span className="workspace-shop">{current?.name}</span></header><main className="content" id="main-content"><Outlet /></main></div>
    </div>
  )
}

function NavIcon({ path }: { path: string }) {
  const paths: Record<string, string> = {
    '/': 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
    '/products': 'm12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8M12 13v9M7 5.8l9 5',
    '/reports': 'M4 3v18h17M8 16v-5m5 5V7m5 9V4',
    '/billing': 'M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6',
    '/team': 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-3.9M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-7a4 4 0 0 1 0 7',
    '/activity': 'M3 12h4l3-8 4 16 3-8h4',
  }
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[path]} /></svg>
}
