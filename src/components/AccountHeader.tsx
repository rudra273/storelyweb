import { NavLink } from 'react-router'

export function AccountHeader({ title, description }: { title: string; description: string }) {
  return <>
    <header className="page-head"><div><p className="eyebrow">YOUR ACCOUNT</p><h1>{title}</h1><p className="page-description">{description}</p></div></header>
    <nav className="settings-tabs" aria-label="Account settings">
      <NavLink to="/account" end>Profile</NavLink>
      <NavLink to="/account/security">Security</NavLink>
    </nav>
  </>
}
