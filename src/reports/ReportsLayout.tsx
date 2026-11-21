import { PageHeader } from '../components/ui/workspace'
import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router'

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
  const { pathname } = useLocation()
  const active = TABS.find(t => t.to === pathname) ?? { to: '/reports', label: 'Overview' }
  // The chosen period follows you from report to report.
  const keep = ['p', 'from', 'to'].flatMap((k) => (params.get(k) ? [[k, params.get(k) as string]] : []))
  const search = keep.length ? `?${new URLSearchParams(keep as [string, string][])}` : ''
  return (
    <div className="reports-page">
      <PageHeader eyebrow="BUSINESS INSIGHTS" title="Reports" description="A clear view of your sales, money and inventory." />
      <nav className="tabs no-print" aria-label="Reports">
        {TABS.map((t) => (
          <NavLink key={t.to} to={{ pathname: t.to, search }} end={t.end}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="report-heading"><h2>{active.label}</h2><p className="muted">{DESCRIPTIONS[active.to]}</p></div>
      <Outlet />
    </div>
  )
}

const DESCRIPTIONS: Record<string, string> = {
  '/reports': 'Key figures and sales trends for your selected period.',
  '/reports/day-book': 'Bills, collections and expenses for a single day.',
  '/reports/profit-loss': 'Sales, costs and expenses that contribute to your profit.',
  '/reports/receivables': 'Outstanding customer balances and how long they have been due.',
  '/reports/expiring': 'Find stock approaching its expiry date.',
  '/reports/purchases': 'Review purchases and supplier costs for your selected period.',
  '/reports/tax': 'Review tax totals and download your GSTR-1 workbook.',
  '/reports/stock': 'Current quantities and the value of your inventory.',
}
