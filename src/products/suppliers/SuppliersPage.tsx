import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Alert, Empty, Field, Loading } from '../../components/ui/ui'
import { Button, PageHeader, Toolbar } from '../../components/ui/workspace'
import { receiptMoney } from '../../purchases/composer/money'
import { can } from '../../permissions'
import { useShop } from '../../shops/context'
import { useSuppliers, type Supplier } from '../queries'
import { SupplierEditor } from './Suppliers'
import { SupplierStatement } from './SupplierStatement'

/** Who you buy from and what you still owe them. Filters live in the address so Back keeps them. */
export function SuppliersPage() {
  const { role } = useShop()
  const canEdit = can(role, 'products.edit')
  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const owing = params.get('owing') === '1'
  const suppliers = useSuppliers()
  const [statement, setStatement] = useState<Supplier | null>(null)
  const [editor, setEditor] = useState<Supplier | 'new' | null>(null)
  const set = (next: { q?: string; owing?: boolean }) => {
    const q = next.q ?? search, o = next.owing ?? owing
    setParams({ ...(q ? { q } : {}), ...(o ? { owing: '1' } : {}) }, { replace: true })
  }
  const needle = search.trim().toLowerCase()
  const rows = suppliers.data
    ?.filter(s => (!owing || Number(s.balance_due ?? '0') > 0) && (!needle || [s.name, s.phone, s.gstin].some(v => v?.toLowerCase().includes(needle))))
    .sort((a, b) => Number(b.balance_due ?? '0') - Number(a.balance_due ?? '0') || a.name.localeCompare(b.name))

  return <div className="suppliers-page">
    <PageHeader eyebrow="PURCHASES" title="Suppliers" description="The people you buy from, what you have bought and what you still owe." actions={<>
      {canEdit && <Button variant="primary" onClick={() => setEditor('new')}>Add supplier</Button>}
      <Link className="button secondary" to="/purchases">Purchase invoices</Link>
    </>} />
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
      <thead><tr><th>Supplier</th><th>Contact</th><th className="num">Balance due</th><th><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{rows.map(s => <tr key={s.uuid}>
        <td><strong>{s.name}</strong></td>
        <td>{[s.phone, s.gstin].filter(Boolean).join(' · ') || <span className="muted">—</span>}</td>
        <td className={`num${Number(s.balance_due ?? '0') > 0 ? ' bad' : ''}`}>{receiptMoney(s.balance_due ?? '0')}</td>
        <td className="row-actions"><button className="link" aria-label={`Statement for ${s.name}`} onClick={() => setStatement(s)}>Statement</button>{canEdit && <button className="link" aria-label={`Edit ${s.name}`} onClick={() => setEditor(s)}>Edit</button>}</td>
      </tr>)}</tbody>
    </table></div>}
    {statement && <SupplierStatement supplier={statement} onClose={() => setStatement(null)} />}
    {editor && <SupplierEditor supplier={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSaved={() => setEditor(null)} />}
  </div>
}
