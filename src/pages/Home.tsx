import { Link } from 'react-router'
import { useAuth } from '../auth/context'
import { Card } from '../components/ui'
import { NAV, can } from '../permissions'
import { useShop } from '../shops/context'

const BLURB: Record<string, string> = {
  '/products': 'Look up products and stock.',
  '/reports': 'Sales, profit and dues.',
  '/billing': 'Create bills and take payments.',
  '/team': 'Invite people and manage roles.',
  '/activity': 'Who did what in this shop.',
}

export function Home() {
  const { user } = useAuth()
  const { current, role } = useShop()
  return (
    <div>
      <h1>Hello{user?.full_name ? `, ${user.full_name}` : ''}</h1>
      <p className="muted">
        {current?.name} · signed in as {role}
      </p>
      <div className="tiles">
        {NAV.filter((item) => can(role, item.needs)).map((item) => (
          <Link key={item.to} to={item.to} className="tile">
            <strong>{item.label}</strong>
            <span>{BLURB[item.to]}</span>
          </Link>
        ))}
      </div>
      <Card title="Your account">
        <p>
          <Link to="/account/security">Security and sessions</Link> · <Link to="/account">Profile</Link>
        </p>
      </Card>
    </div>
  )
}
