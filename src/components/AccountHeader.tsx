import { PageHeader } from './workspace'
import { NavLink, useLocation } from 'react-router'

export function AccountHeader({ title, description }: { title: string; description: string }) {
  const base = useLocation().pathname.startsWith('/platform/') ? '/platform/account' : '/account'
  return <>
    <PageHeader eyebrow="YOUR ACCOUNT" title={title} description={description} />
    <nav className="settings-tabs" aria-label="Account settings">
      <NavLink to={base} end>Profile</NavLink>
      <NavLink to={`${base}/security`}>Security</NavLink>
    </nav>
  </>
}
