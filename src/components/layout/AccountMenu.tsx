import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../auth/context'
import { AppearanceControl } from '../../theme/AppearanceControl'

/** The signed-in person: profile, security, appearance and sign out, kept apart from shop navigation. */
export function AccountMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  // Moving to another page closes the menu.
  const [shownAt, setShownAt] = useState(pathname)
  if (shownAt !== pathname) { setShownAt(pathname); setOpen(false) }
  const root = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const name = user?.full_name || user?.email || 'Account'

  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); toggle.current?.focus() } }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape) }
  }, [open])

  return <div className="account-menu" ref={root}>
    {open && <div className="account-panel" role="group" aria-label="Account menu">
      <p className="account-email">{user?.email}</p>
      <Link to="/account">Account settings</Link>
      <Link to="/account/security">Security and sessions</Link>
      <AppearanceControl tone="inverse" />
      <button className="link" onClick={async () => { await logout(); void navigate('/login') }}>Sign out</button>
    </div>}
    <button ref={toggle} className="account-toggle" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)} title={name}>
      <span className="account-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
      <span className="account-name nav-text">{name}<small>Account</small></span>
    </button>
  </div>
}
