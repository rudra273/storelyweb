import { PageHeader, Toolbar } from '../components/ui/workspace'
import { day, paymentStatus } from '../components/labels'
import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Alert, Empty, Field, Loading } from '../components/ui/ui'
import { describeError } from '../components/useAction'
import { formatMoney } from '../lib/money'
import { useDebounced } from '../lib/useDebounced'
import { SALES } from '../lib/vocabulary'
import { useBillingQuery, type BillPage } from './queries'

export function BillsPage() {
  // Filters live in the address, so Back from an invoice returns to the same list.
  const [url, setUrl] = useSearchParams()
  const location = useLocation()
  const [search, setSearch] = useState(url.get('q') ?? '')
  const q = useDebounced(search, 250)
  const status = url.get('status') ?? ''
  const kind = url.get('kind') ?? ''
  const from = url.get('from') ?? ''
  const to = url.get('to') ?? ''
  const cancelled = url.get('voided') === '1'
  const unassigned = url.get('unassigned_credit') === '1'
  const page = Math.max(0, Number(url.get('page')) || 0)
  const change = (patch: Record<string, string>) => setUrl(prev => {
    const next = new URLSearchParams(prev)
    for (const [k, v] of Object.entries(patch)) if (v) next.set(k, v); else next.delete(k)
    if (!('page' in patch)) next.delete('page')
    return next
  }, { replace: true })
  const setPage = (n: number) => change({ page: n ? String(n) : '' })
  // The address keeps the search too, a moment after typing stops.
  const urlQ = url.get('q') ?? ''
  useEffect(() => { if (urlQ !== q) change({ q }) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps
  const params = new URLSearchParams({ limit: '25', cursor: String(page * 25), cancelled: String(cancelled) })
  if (unassigned) params.set('unassigned_credit', 'true')
  for (const [k, v] of Object.entries({ q, status, kind, from, to })) if (v) params.set(k, v)

  const query = useBillingQuery<BillPage>('bills', `bills?${params}`)
  return <div className="billing-page">
    <PageHeader eyebrow="SALES" title="Invoices" description="Find invoices, follow up on payments and manage returns." actions={<Link className="primary button" to="/billing/new">{SALES.newInvoice}</Link>} />
    <Toolbar label="Filter invoices" className="bill-filters">
      <Field label="Search invoices" type="search" maxLength={100} value={search} onChange={e => setSearch(e.target.value)} />
      <label>Payment status<select value={status} onChange={e => change({ status: e.target.value })}><option value="">All statuses</option><option value="paid">Paid</option><option value="partial">{paymentStatus('partial')}</option><option value="unpaid">Unpaid</option></select></label>
      <label>Document<select value={kind} onChange={e => change({ kind: e.target.value })}><option value="">All documents</option><option value="invoice">Invoices</option><option value="credit_note">Credit notes</option></select></label>
      <Field label="From" type="date" value={from} onChange={e => change({ from: e.target.value })} />
      <Field label="To" type="date" min={from} value={to} onChange={e => change({ to: e.target.value })} />
      <label className="check inline"><input type="checkbox" checked={cancelled} onChange={e => change(e.target.checked ? { voided: '1', unassigned_credit: '' } : { voided: '' })} />Voided invoices</label>
      <label className="check inline"><input type="checkbox" checked={unassigned} onChange={e => change(e.target.checked ? { unassigned_credit: '1', voided: '', status: '', kind: '' } : { unassigned_credit: '' })} />Unassigned balances</label>
    </Toolbar>
    {(search || status || kind || from || to || cancelled || unassigned) && <button className="link clear-bill-filters" onClick={() => { setSearch(''); setUrl({}, { replace: true }) }}>Clear filters</button>}
    {query.isPending && <Loading />}
    {query.error && <Alert>{describeError(query.error)} <button className="link" onClick={() => void query.refetch()}>Retry</button></Alert>}
    {query.data && <>
      {query.data.items.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Number / date</th><th className="hide-sm">Customer</th><th>Status</th><th>Total</th><th>Due</th></tr></thead><tbody>
        {query.data.items.map(b => <tr key={b.uuid}><td><Link to={`/billing/${b.uuid}`} state={{ from: location.pathname + location.search }}>{b.bill_number}</Link><br /><small>{day(b.created_at)}{b.document_type === 'credit_note' ? ' · Credit note' : ''}</small></td><td className="hide-sm">{b.customer_name}</td><td><span className={`payment-badge ${b.cancelled ? 'cancelled' : b.document_type === 'credit_note' ? 'credit' : b.payment_status}`}>{b.cancelled ? 'Voided' : b.document_type === 'credit_note' ? 'Credit note' : paymentStatus(b.payment_status)}</span></td><td>{formatMoney(b.total_amount)}</td><td>{formatMoney(b.balance_due)}</td></tr>)}
      </tbody></table></div> : <Empty title="No invoices found">Create an invoice or change the filters.</Empty>}
      <div className="pager"><span className="muted">{query.data.total} documents</span><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button disabled={!query.data.next_cursor} onClick={() => setPage(page + 1)}>Next</button></div>
    </>}
  </div>
}
