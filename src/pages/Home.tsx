import { PageHeader } from '../components/workspace'
import { Link } from 'react-router'
import { useAuth } from '../auth/context'
import { NAV, can } from '../permissions'
import { useShop } from '../shops/context'
import { Tile } from '../reports/ReportBits'
import { useReport, type Kpis } from '../reports/queries'
import { State } from '../reports/State'
import { today } from '../reports/periods'
import { formatMoney } from '../lib/money'

const BLURB: Record<string, string> = {
  '/products': 'Find products, check stock and keep your catalogue up to date.',
  '/reports': 'Understand sales, profit and outstanding payments.',
  '/billing': 'Create a bill, record a payment or find an invoice.',
  '/team': 'Invite your team and manage their access.',
  '/activity': 'Review recent changes made in your shop.',
}

export function Home() {
  const { user } = useAuth()
  const { current, role } = useShop()
  return (
    <div className="home-page">
      <PageHeader eyebrow="YOUR WORKSPACE" title={`Hello${user?.full_name ? `, ${user.full_name}` : ''}`} description={`Here’s what’s happening at ${current?.name}.`} actions={can(role, 'billing.create') ? <Link className="primary button" to="/billing/new">Create bill <span aria-hidden="true">↗</span></Link> : undefined} />
      {can(role, 'reports.view') ? <DailySummary /> : <section className="staff-welcome"><div><p className="eyebrow">READY FOR THE DAY</p><h2>Everything you need at the counter.</h2><p>Look up a product, check its availability or start your next bill.</p></div><Link className="button secondary" to="/products">Browse products →</Link></section>}
      <section className="home-shortcuts" aria-labelledby="shortcuts-heading">
        <div className="section-heading"><div><h2 id="shortcuts-heading">Your daily tools</h2><p className="muted">Pick up where you need to work.</p></div></div>
        <div className="tiles">
          {NAV.filter(item => can(role, item.needs)).map((item, index) => <Link key={item.to} to={item.to} className="tile"><span className="shortcut-number" aria-hidden="true">0{index + 1}</span><strong>{item.label}<span aria-hidden="true">↗</span></strong><span>{BLURB[item.to]}</span></Link>)}
        </div>
      </section>
      <footer className="home-footer"><span>Make Storely yours</span><div><Link to="/account">Profile settings</Link><Link to="/account/security">Security and sessions</Link></div></footer>
    </div>
  )
}

function DailySummary() {
  const day = today()
  const query = useReport<Kpis>('kpis', { from: day, to: day })
  return <section aria-labelledby="daily-heading"><div className="section-heading"><div><h2 id="daily-heading">Today at a glance</h2><p className="muted">Sales and collections for today. Stock and unpaid bills across your shop.</p></div><Link to="/reports">View reports →</Link></div>
    <State query={query}>{k => <>
      <div className="kpis home-kpis">
        <Tile label="Today’s sales" value={formatMoney(k.revenue)} note={`${k.invoices} invoice${k.invoices === 1 ? '' : 's'} · net of returns`} />
        <Tile label="Money received today" value={formatMoney(k.collected)} />
        <Tile label="Outstanding payments" value={formatMoney(k.unpaid_total)} note={`${k.unpaid_count} unpaid bill${k.unpaid_count === 1 ? '' : 's'} · all time`} tone={k.unpaid_count ? 'bad' : undefined} />
        <Tile label="Stock at cost" value={formatMoney(k.inventory_value)} note="Current inventory value" />
      </div>
      <div className="attention-strip"><div><span className="attention-dot" aria-hidden="true" /><strong>Stock watch</strong><span>{k.low_stock_count} running low · {k.out_of_stock_count} out of stock</span></div><Link to="/products?low=1">Review stock →</Link></div>
    </>}</State>
  </section>
}
