import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { useAuth } from '../auth/context'
import { NAV, can } from '../permissions'
import { useShop } from '../shops/context'

export function AppLayout() {
  const { user, logout } = useAuth()
  const { shops, current, role, select } = useShop()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const items = NAV.filter((item) => can(role, item.needs))

  return (
    <div className="shell">
      <aside className="sidebar" data-open={open}>
        <div className="sidebar-top">
          <span className="brand">Storely</span>
          <button className="menu-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            Menu
          </button>
        </div>
        <div className="sidebar-body">
          {shops.length > 1 ? (
            <label className="shop-switch">
              <span>Shop</span>
              <select value={current?.shop_id ?? ''} onChange={(e) => select(e.target.value)}>
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
          <nav aria-label="Main">
            <NavLink to="/" end onClick={() => setOpen(false)}>
              Home
            </NavLink>
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <nav aria-label="Account" className="account-nav">
            <NavLink to="/account" onClick={() => setOpen(false)}>
              {user?.full_name || user?.email}
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
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
