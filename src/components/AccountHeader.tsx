import { PageHeader } from './workspace'
import { NavLink } from 'react-router'

export function AccountHeader({ title, description }: { title: string; description: string }) {
  return <>
    <PageHeader eyebrow="YOUR ACCOUNT" title={title} description={description} />
    <nav className="settings-tabs" aria-label="Account settings">
      <NavLink to="/account" end>Profile</NavLink>
      <NavLink to="/account/security">Security</NavLink>
    </nav>
  </>
}
