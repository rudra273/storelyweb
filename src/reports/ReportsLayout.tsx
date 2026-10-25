import { NavLink, Outlet, useSearchParams } from 'react-router'

const TABS = [
  { to: '/reports', label: 'Overview', end: true },
  { to: '/reports/day-book', label: 'Day book' },
  { to: '/reports/profit-loss', label: 'Profit and loss' },
  { to: '/reports/receivables', label: 'Who owes you' },
  { to: '/reports/expiring', label: 'Expiring stock' },
  { to: '/reports/purchases', label: 'Purchases' },
  { to: '/reports/tax', label: 'Tax and GSTR-1' },
  { to: '/reports/stock', label: 'Stock value' },
]

export function ReportsLayout() {
  const [params] = useSearchParams()
  // The chosen period follows you from report to report.
  const keep = ['p', 'from', 'to'].flatMap((k) => (params.get(k) ? [[k, params.get(k) as string]] : []))
  const search = keep.length ? `?${new URLSearchParams(keep as [string, string][])}` : ''
  return (
    <div>
      <h1>Reports</h1>
      <nav className="tabs no-print" aria-label="Reports">
        {TABS.map((t) => (
          <NavLink key={t.to} to={{ pathname: t.to, search }} end={t.end}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
