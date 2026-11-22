import { Alert, Loading } from '../../components/ui/ui'
import { useBillingQuery, type BillPage } from '../../billing/queries'
import { WorkspaceSearch } from './WorkspaceSearch'
import { PageHeader } from '../../components/ui/workspace'
import { useProducts } from '../../products/queries'
import { Link } from 'react-router'
import { useAuth } from '../../auth/context'
import { can } from '../../permissions'
import { ALL_DESTINATIONS } from '../../navigation'
import { useShop } from '../../shops/context'
import { Tile } from '../../reports/ReportBits'
import { useReport, type Kpis } from '../../reports/queries'
import { State } from '../../reports/State'
import { KpiSkeletons } from '../../components/ui/states'
import { today } from '../../reports/periods'
import { formatMoney } from '../../lib/money'

export function Home() {
  const { user } = useAuth()
  const { current, role } = useShop()
  return (
    <div className="home-page">
      <PageHeader eyebrow="YOUR WORKSPACE" title={`Hello${user?.full_name ? `, ${user.full_name}` : ''}`} description={`Here’s what’s happening at ${current?.name}.`} actions={can(role, 'billing.create') ? <Link className="primary button" to="/billing/new">New invoice <span aria-hidden="true">↗</span></Link> : undefined} />
      <WorkspaceSearch>
      {can(role, 'products.edit') && <GettingStarted />}
      {can(role, 'reports.view') ? <DailySummary /> : <section className="staff-welcome"><div><p className="eyebrow">READY FOR THE DAY</p><h2>Everything you need at the counter.</h2><p>Look up a product, check its availability or start your next bill.</p></div><Link className="button secondary" to="/products">Browse products →</Link></section>}
      <section className="home-shortcuts" aria-labelledby="shortcuts-heading">
        <div className="section-heading"><div><h2 id="shortcuts-heading">Your daily tools</h2><p className="muted">Pick up where you need to work.</p></div></div>
        <div className="tiles">
          {ALL_DESTINATIONS.filter(item => item.blurb && (!item.needs || can(role, item.needs))).map((item, index) => <Link key={item.to} to={item.to} className="tile"><span className="shortcut-number" aria-hidden="true">0{index + 1}</span><strong>{item.label}<span aria-hidden="true">↗</span></strong><span>{item.blurb}</span></Link>)}
        </div>
      </section>
      <footer className="home-footer"><span>Make Storely yours</span><div><Link to="/account">Profile settings</Link><Link to="/account/security">Security and sessions</Link></div></footer>
      </WorkspaceSearch>
    </div>
  )
}

function DailySummary() {
  const day = today()
  const query = useReport<Kpis>('kpis', { from: day, to: day })
  return <section aria-labelledby="daily-heading"><div className="section-heading"><div><h2 id="daily-heading">Today at a glance</h2><p className="muted">Sales and collections for today. Stock and unpaid bills across your shop.</p></div><Link to="/reports">View reports →</Link></div>
    <State query={query} fallback={<KpiSkeletons count={4} className="kpis home-kpis" />}>{k => <>
      <div className="kpis home-kpis">
        <Tile label="Today’s sales" value={formatMoney(k.revenue)} note={`${k.invoices} invoice${k.invoices === 1 ? '' : 's'} · net of returns`} comparison={k.comparisons ? k.comparisons.revenue ?? null : undefined} to={`/billing?from=${day}&to=${day}`} />
        <Tile label="Money received today" value={formatMoney(k.collected)} comparison={k.comparisons ? k.comparisons.collected ?? null : undefined} to={`/reports/day-book?day=${day}`} />
        <Tile label="Outstanding payments" value={formatMoney(k.unpaid_total)} note={`${k.unpaid_count} unpaid invoice${k.unpaid_count === 1 ? '' : 's'} · all time`} tone={k.unpaid_count ? 'bad' : undefined} to="/customers?owing=1" />
        <Tile label="Stock at cost" value={formatMoney(k.inventory_value)} note={k.gst_registered ? 'Current inventory value' : 'Current inventory value, incl. GST paid on purchase'} to="/reports/stock" />
      </div>
      <div className="attention-strip"><div><span className="attention-dot" aria-hidden="true" /><strong>Stock watch</strong><span>{k.low_stock_count} running low · {k.out_of_stock_count} out of stock</span></div><Link to="/products?low=1">Review stock →</Link></div>
    </>}</State>
  </section>
}

/** A saved invoice, including a voided original, completes the first-invoice milestone. */
function GettingStarted() {
  const active = useBillingQuery<BillPage>('bills', 'bills?kind=invoice&cancelled=false&limit=1')
  const hasInvoice = (page: BillPage | undefined) => page?.items.some(bill => bill.document_type === 'invoice') ?? false
  const completed = hasInvoice(active.data)
  // The existing API exposes active and voided records separately.
  const cancelled = useBillingQuery<BillPage>('bills', 'bills?kind=invoice&cancelled=true&limit=1', !!active.data && !completed && !active.error && !active.isFetching)
  if (completed || hasInvoice(cancelled.data)) return null
  if (active.error || cancelled.error) return <section className="card wide" aria-label="Setup progress"><Alert>Could not check your first-invoice progress. <button type="button" className="link" onClick={() => { void active.refetch(); if (active.data) void cancelled.refetch() }}>Retry setup progress</button></Alert></section>
  if (active.isPending || active.isFetching || cancelled.isPending || cancelled.isFetching) return <section className="card wide" aria-label="Setup progress"><Loading label="Checking first-invoice progress…" /></section>
  return <FirstInvoiceSteps />
}

function FirstInvoiceSteps() {
  const products = useProducts({ q: '', category: '', low: false, expiring: false, noCode: false, out: false, sort: 'name', dir: 'asc', page: 0 })
  if (products.error) return <section className="card wide" aria-label="Setup progress"><Alert>Could not check your catalog. <button type="button" className="link" onClick={() => void products.refetch()}>Retry setup progress</button></Alert></section>
  if (products.isPending || !products.data) return <section className="card wide" aria-label="Setup progress"><Loading label="Checking your catalog…" /></section>
  const hasProducts = products.data.items.length > 0
  return <section className="card wide getting-started" aria-labelledby="start-heading">
    <h2 id="start-heading">Get your shop ready</h2>
    <p className="muted">{hasProducts ? 'Your catalog has products. Check stock and record your first invoice.' : 'Start with a product and its selling price. Enter actual opening stock for tracked products, or receive stock before selling.'}</p>
    <p><Link className="button primary" to={hasProducts ? '/billing/new' : '/products?new=1'}>{hasProducts ? 'Create your first invoice' : 'Add your first product'}</Link></p>
    <p className="muted">You can review these setup details at any time.</p>
    <ol>
      <li><Link to="/settings?tab=shop"><strong>Shop identity</strong><span>Name, address, phone and GSTIN, as they print on invoices.</span></Link></li>
      <li><Link to="/settings?tab=pricing"><strong>Tax configuration</strong><span>Regular GST, composition or not registered, and default rates.</span></Link></li>
      <li><Link to="/settings?tab=printing"><strong>Invoice and printing</strong><span>Choose A4, A5 or a receipt roll and preview the layout.</span></Link></li>
    </ol>
  </section>
}
