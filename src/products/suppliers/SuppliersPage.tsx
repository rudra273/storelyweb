import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Kpi } from '../../components/ui/Kpi'
import { Alert, Empty, Field, Loading } from '../../components/ui/ui'
import { ErrorState, KpiSkeletons } from '../../components/ui/states'
import { Button, PageHeader, Toolbar } from '../../components/ui/workspace'
import { receiptMoney } from '../../purchases/composer/money'
import { NO_FILTERS, usePurchaseSummary } from '../../purchases/queries'
import { can } from '../../permissions'
import { useShop } from '../../shops/context'
import { useSuppliers, type Supplier } from '../queries'
import { SupplierEditor } from './Suppliers'
import '../../purchases/purchases.css'

/** Who you buy from and what you still owe them. Filters live in the address so Back keeps them. */
export function SuppliersPage() {
  const { role } = useShop()
  const canEdit = can(role, 'products.edit')
  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const owing = params.get('owing') === '1'
  const suppliers = useSuppliers()
  const summary = usePurchaseSummary(NO_FILTERS)
  const [editor, setEditor] = useState<Supplier | 'new' | null>(null)
  const set = (next: { q?: string; owing?: boolean }) => {
    const q = next.q ?? search, o = next.owing ?? owing
    setParams({ ...(q ? { q } : {}), ...(o ? { owing: '1' } : {}) }, { replace: true })
  }
  const needle = search.trim().toLowerCase()
  const rows = suppliers.data
    ?.filter(s => (!owing || Number(s.balance_due ?? '0') > 0) && (!needle || [s.name, s.phone, s.gstin].some(v => v?.toLowerCase().includes(needle))))
    .sort((a, b) => Number(b.balance_due ?? '0') - Number(a.balance_due ?? '0') || a.name.localeCompare(b.name))
  const s = summary.data

  return <div className="suppliers-page">
    <PageHeader eyebrow="PURCHASES" title="Suppliers" description="The people you buy from, what you have bought and what you still owe." actions={<>
      {canEdit && <Button variant="primary" onClick={() => setEditor('new')}>Add supplier</Button>}
      <Link className="button secondary" to="/purchases">Purchase invoices</Link>
    </>} />
    {summary.isPending && <KpiSkeletons count={3} label="Loading what you owe…" />}
    {summary.error && <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />}
    {s && <div className="kpis purchase-kpis">
      <Link to="?owing=1" className="kpi-link" onClick={e => { e.preventDefault(); set({ owing: true }) }}><Kpi label="You owe suppliers" value={receiptMoney(s.payable)} note={`Today · ${s.suppliers_owed} supplier${s.suppliers_owed === 1 ? '' : 's'}`} /></Link>
      <Link to="/purchases?overdue=1" className="kpi-link"><Kpi label="Overdue" value={receiptMoney(s.overdue)} tone={Number(s.overdue) > 0 ? 'bad' : undefined} note={`Today · ${s.overdue_purchases} purchase${s.overdue_purchases === 1 ? '' : 's'} past due date`} /></Link>
      <Kpi label="Paid to suppliers" value={receiptMoney(s.payments_made)} note="All time" />
    </div>}
    <Toolbar label="Filter suppliers">
      <Field label="Search suppliers" type="search" placeholder="Name, phone or GSTIN" value={search} onChange={e => set({ q: e.target.value })} />
      <label className="check inline"><input type="checkbox" checked={owing} onChange={e => set({ owing: e.target.checked })} /> Only suppliers I owe</label>
    </Toolbar>
    {suppliers.isPending && <Loading label="Loading suppliers…" />}
    {suppliers.error && <Alert>Suppliers could not be loaded. <button className="link" onClick={() => void suppliers.refetch()}>Retry</button></Alert>}
    {rows && rows.length === 0 && (search || owing
      ? <Empty title="No suppliers match">Change or clear the filters.</Empty>
      : <Empty title="No suppliers yet">Add the people you buy stock from to track purchases and what you owe them.{canEdit && <div className="actions empty-actions"><Button variant="primary" onClick={() => setEditor('new')}>Add supplier</Button></div>}</Empty>)}
    {!!rows?.length && <div className="table-wrap"><table className="table">
      <thead><tr><th>Supplier</th><th className="hide-sm">Contact</th><th className="num hide-sm">Overdue</th><th className="num">You owe</th><th><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{rows.map(x => <tr key={x.uuid}>
        <td><Link to={`/suppliers/${x.uuid}`}><strong>{x.name}</strong></Link></td>
        <td className="hide-sm">{[x.phone, x.gstin].filter(Boolean).join(' · ') || <span className="muted">—</span>}</td>
        <td className={`num hide-sm${Number(x.overdue_due ?? '0') > 0 ? ' bad' : ''}`}>{Number(x.overdue_due ?? '0') > 0 ? receiptMoney(x.overdue_due ?? '0') : <span className="muted">—</span>}</td>
        <td className={`num${Number(x.balance_due ?? '0') > 0 ? ' bad' : ''}`}>{receiptMoney(x.balance_due ?? '0')}</td>
        <td className="row-actions"><Link to={`/suppliers/${x.uuid}`} aria-label={`Account of ${x.name}`}>Account</Link>{canEdit && <button className="link" aria-label={`Edit ${x.name}`} onClick={() => setEditor(x)}>Edit</button>}</td>
      </tr>)}</tbody>
    </table></div>}
    {editor && <SupplierEditor supplier={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSaved={() => setEditor(null)} />}
  </div>
}
