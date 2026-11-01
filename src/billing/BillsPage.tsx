import { PageHeader, Toolbar } from '../components/ui/workspace'
import { day, paymentStatus } from '../components/labels'
import { useState } from 'react'
import { Link } from 'react-router'
import { Alert, Empty, Field, Loading } from '../components/ui/ui'
import { describeError } from '../components/useAction'
import { formatMoney } from '../lib/money'
import { useDebounced } from '../lib/useDebounced'
import { useBillingQuery, type BillPage } from './queries'

export function BillsPage() {
  const [search, setSearch] = useState('')
  const q = useDebounced(search, 250)
  const [status, setStatus] = useState('')
  const [kind, setKind] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [cancelled, setCancelled] = useState(false)
  const [page, setPage] = useState(0)
  const params = new URLSearchParams({ limit: '25', cursor: String(page * 25), cancelled: String(cancelled) })
  for (const [k, v] of Object.entries({ q, status, kind, from, to })) if (v) params.set(k, v)
  const query = useBillingQuery<BillPage>('bills', `bills?${params}`)
  return <div className="billing-page">
    <PageHeader eyebrow="SALES" title="Invoices" description="Find invoices, follow up on payments and manage returns." actions={<Link className="primary button" to="/billing/new">New invoice</Link>} />
    <Toolbar label="Filter bills" className="bill-filters" onChange={() => setPage(0)}>
      <Field label="Search bills" type="search" maxLength={100} value={search} onChange={e => setSearch(e.target.value)} />
      <label>Payment status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option><option value="paid">Paid</option><option value="partial">{paymentStatus('partial')}</option><option value="unpaid">Unpaid</option></select></label>
      <label>Document<select value={kind} onChange={e => setKind(e.target.value)}><option value="">All documents</option><option value="invoice">Invoices</option><option value="credit_note">Credit notes</option></select></label>
      <Field label="From" type="date" value={from} onChange={e => setFrom(e.target.value)} />
      <Field label="To" type="date" min={from} value={to} onChange={e => setTo(e.target.value)} />
      <label className="check inline"><input type="checkbox" checked={cancelled} onChange={e => setCancelled(e.target.checked)} />Cancelled bills</label>
    </Toolbar>
    {(search || status || kind || from || to || cancelled) && <button className="link clear-bill-filters" onClick={() => { setSearch(''); setStatus(''); setKind(''); setFrom(''); setTo(''); setCancelled(false); setPage(0) }}>Clear filters</button>}
    {query.isPending && <Loading />}
    {query.error && <Alert>{describeError(query.error)} <button className="link" onClick={() => void query.refetch()}>Retry</button></Alert>}
    {query.data && <>
      {query.data.items.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Number / date</th><th className="hide-sm">Customer</th><th>Status</th><th>Total</th><th>Due</th></tr></thead><tbody>
        {query.data.items.map(b => <tr key={b.uuid}><td><Link to={`/billing/${b.uuid}`}>{b.bill_number}</Link><br /><small>{day(b.created_at)}{b.document_type === 'credit_note' ? ' · Credit note' : ''}</small></td><td className="hide-sm">{b.customer_name}</td><td><span className={`payment-badge ${b.cancelled ? 'cancelled' : b.payment_status}`}>{b.cancelled ? 'Cancelled' : paymentStatus(b.payment_status)}</span></td><td>{formatMoney(b.total_amount)}</td><td>{formatMoney(b.balance_due)}</td></tr>)}
      </tbody></table></div> : <Empty title="No bills found">Create a bill or change the filters.</Empty>}
      <div className="pager"><span className="muted">{query.data.total} documents</span><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button disabled={!query.data.next_cursor} onClick={() => setPage(page + 1)}>Next</button></div>
    </>}
  </div>
}
