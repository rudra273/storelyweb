import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { day, paymentStatus } from '../components/labels'
import { Kpi } from '../components/ui/Kpi'
import { Alert, Empty, Field, Loading } from '../components/ui/ui'
import { ErrorState, KpiSkeletons } from '../components/ui/states'
import { Button, PageHeader, Toolbar } from '../components/ui/workspace'
import { useDebounced } from '../lib/useDebounced'
import { can } from '../permissions'
import { useSuppliers } from '../products/queries'
import { useShop } from '../shops/context'
import { todayInShop } from './composer/draft'
import { receiptMoney } from './composer/money'
import { RECEIPT_PAGE_SIZE, useReceipts, usePurchaseSummary, type ReceiptFilters } from './queries'
import './purchases.css'

const STATUSES = [['', 'All payment states'], ['open', 'Still owed (unpaid or part paid)'], ['unpaid', 'Unpaid'], ['partial', 'Partially paid'], ['paid', 'Paid'], ['not_recorded', 'Payment not recorded']] as const

/** Stock received from suppliers: what came in, from whom, and what is still owed. Filters live in the address so Back keeps them. */
export function PurchaseInvoicesPage() {
  const { current, role } = useShop()
  const canRecord = can(role, 'products.edit')
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const q = useDebounced(search, 250)
  const filters: ReceiptFilters = { supplier: params.get('supplier') ?? '', q, status: params.get('status') ?? '', overdue: params.get('overdue') === '1', from: params.get('from') ?? '', to: params.get('to') ?? '' }
  const page = Math.max(0, Number(params.get('page')) || 0)
  const change = (patch: Record<string, string>) => setParams(previous => {
    const next = new URLSearchParams(previous)
    for (const [key, value] of Object.entries(patch)) if (value) next.set(key, value); else next.delete(key)
    if (!('page' in patch)) next.delete('page')
    return next
  }, { replace: true })
  const urlQ = params.get('q') ?? ''
  useEffect(() => { if (urlQ !== q) change({ q }) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps
  const suppliers = useSuppliers()
  const receipts = useReceipts(filters, page)
  const summary = usePurchaseSummary(filters)
  const rows = receipts.data ?? []
  const filtered = !!(filters.supplier || filters.q || filters.status || filters.overdue || filters.from || filters.to)
  const today = todayInShop()
  const periodNote = filters.from || filters.to ? 'In the dates chosen' : 'All time'
  const s = summary.data
  const here = location.pathname + location.search

  return <div className="purchases-page">
    <PageHeader eyebrow="PURCHASES" title="Purchase invoices" description={`Stock received from suppliers at ${current?.name ?? 'your shop'}, and what is still owed.`} actions={<>
      {canRecord && <Link className="button primary" to="/purchases/new">Record purchase</Link>}
      <Link className="button secondary" to="/suppliers">Suppliers</Link>
    </>} />
    {summary.isPending && <KpiSkeletons count={4} label="Loading purchase figures…" />}
    {summary.error && <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />}
    {s && <>
      <div className="kpis purchase-kpis">
        <Link to="?" onClick={e => { e.preventDefault(); change({ status: '', overdue: '' }) }} className="kpi-link"><Kpi label="Purchased" value={receiptMoney(s.purchase_value)} note={`${periodNote} · ${s.purchases} purchase${s.purchases === 1 ? '' : 's'}`} /></Link>
        <Kpi label="Paid to suppliers" value={receiptMoney(s.payments_made)} note={periodNote} />
        <Link to="?" onClick={e => { e.preventDefault(); change({ status: 'open', overdue: '' }) }} className="kpi-link"><Kpi label="You owe suppliers" value={receiptMoney(s.payable)} note={`Today · ${s.suppliers_owed} supplier${s.suppliers_owed === 1 ? '' : 's'}`} /></Link>
        <Link to="?" onClick={e => { e.preventDefault(); change({ status: '', overdue: '1' }) }} className="kpi-link"><Kpi label="Overdue" value={receiptMoney(s.overdue)} tone={Number(s.overdue) > 0 ? 'bad' : undefined} note={`Today · ${s.overdue_purchases} purchase${s.overdue_purchases === 1 ? '' : 's'} past due date`} /></Link>
      </div>
      {s.unrecorded_purchases > 0 && <Alert kind="info">{s.unrecorded_purchases} purchase{s.unrecorded_purchases === 1 ? ' has' : 's have'} no payment terms recorded ({receiptMoney(s.unrecorded_stock_cost)} of stock). {s.unrecorded_purchases === 1 ? 'It is' : 'They are'} not counted in what you owe. <button className="link" onClick={() => change({ status: 'not_recorded', overdue: '' })}>Show {s.unrecorded_purchases === 1 ? 'it' : 'them'}</button></Alert>}
    </>}
    <Toolbar label="Filter purchases" className="purchase-filters">
      <Field label="Search purchases" type="search" maxLength={100} placeholder="Supplier or invoice number" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="field"><label htmlFor="purchase-filter-supplier">Supplier</label><select id="purchase-filter-supplier" value={filters.supplier} onChange={e => change({ supplier: e.target.value })}><option value="">All suppliers</option>{suppliers.data?.map(x => <option key={x.uuid} value={x.uuid}>{x.name}</option>)}</select></div>
      <div className="field"><label htmlFor="purchase-filter-status">Payment</label><select id="purchase-filter-status" value={filters.status} onChange={e => change({ status: e.target.value, overdue: '' })}>{STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <Field label="From" type="date" max={filters.to || undefined} value={filters.from} onChange={e => change({ from: e.target.value })} />
      <Field label="To" type="date" min={filters.from || undefined} value={filters.to} onChange={e => change({ to: e.target.value })} />
      <label className="check inline"><input type="checkbox" checked={filters.overdue} onChange={e => change({ overdue: e.target.checked ? '1' : '' })} />Overdue only</label>
    </Toolbar>
    {filtered && <button className="link clear-purchase-filters" onClick={() => { setSearch(''); setParams({}, { replace: true }) }}>Clear filters</button>}
    {receipts.isPending && <Loading label="Loading purchases…" />}
    {receipts.error && <ErrorState error={receipts.error} onRetry={() => void receipts.refetch()} />}
    {receipts.data && rows.length === 0 && (page > 0
      ? <Empty title="No purchases on this page"><Button onClick={() => change({ page: page > 1 ? String(page - 1) : '' })}>Previous page</Button></Empty>
      : filtered
        ? <Empty title="No purchases match">Change or clear the filters.</Empty>
        : <Empty title="No purchases recorded yet">Record stock you receive from a supplier to keep stock and what you owe accurate.{canRecord && <div className="actions empty-actions"><Link className="button primary" to="/purchases/new">Record purchase</Link></div>}</Empty>)}
    {rows.length > 0 && <div className="table-wrap"><table className="table">
      <thead><tr><th>Date</th><th>Supplier</th><th className="hide-sm">Supplier invoice</th><th className="num">Total</th><th className="hide-sm">Payment</th><th className="hide-sm">Due date</th><th className="num">Balance due</th></tr></thead>
      <tbody>{rows.map(r => {
        const late = !!r.due_date && r.due_date < today && Number(r.balance_due ?? '0') > 0
        return <tr key={r.uuid}>
          <td className="nowrap"><Link to={`/purchases/${r.uuid}`} state={{ from: here }} aria-label={`View purchase ${r.invoice_number ?? day(r.purchase_date)}`}>{day(r.purchase_date)}</Link></td>
          <td>{r.supplier_name ?? <span className="muted">No supplier</span>}<small className="show-sm muted">{r.invoice_number ?? ''} {paymentStatus(r.payment_status)}</small></td>
          <td className="hide-sm">{r.invoice_number ?? <span className="muted">—</span>}</td>
          <td className="num">{r.total == null ? <span className="muted" title="Stock cost; payment terms were not recorded">{receiptMoney(r.subtotal)}<small className="stacked-note">stock cost</small></span> : receiptMoney(r.total)}</td>
          <td className="hide-sm"><span className={`payment-badge ${r.payment_status}`}>{paymentStatus(r.payment_status)}</span></td>
          <td className="hide-sm nowrap">{r.due_date ? <>{day(r.due_date)}{late && <span className="payment-badge unpaid overdue-flag">Overdue</span>}</> : <span className="muted">—</span>}</td>
          <td className="num">{r.balance_due == null ? <span className="muted">—</span> : receiptMoney(r.balance_due)}</td>
        </tr>
      })}</tbody>
    </table></div>}
    {(page > 0 || rows.length === RECEIPT_PAGE_SIZE) && <div className="pager">
      <span className="muted">Page {page + 1}</span>
      <Button disabled={page === 0 || receipts.isFetching} onClick={() => change({ page: page > 1 ? String(page - 1) : '' })}>Previous</Button>
      <Button disabled={rows.length !== RECEIPT_PAGE_SIZE || receipts.isFetching} onClick={() => change({ page: String(page + 1) })}>Next</Button>
    </div>}
    <p className="muted report-note">Purchases recorded before this screen existed remain in Reports → Purchases.</p>
  </div>
}
