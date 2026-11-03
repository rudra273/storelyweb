import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { components } from '../../api/schema'
import { day, paymentMethod } from '../../components/labels'
import { Kpi } from '../../components/ui/Kpi'
import { Alert, Empty, Loading } from '../../components/ui/ui'
import { ErrorState, KpiSkeletons } from '../../components/ui/states'
import { Button, PageHeader } from '../../components/ui/workspace'
import { saveCsv } from '../../lib/download'
import { can } from '../../permissions'
import { todayInShop } from '../../purchases/composer/draft'
import { receiptMoney } from '../../purchases/composer/money'
import { useShop } from '../../shops/context'
import { useSuppliers } from '../queries'
import { SupplierEditor } from './Suppliers'
import { SupplierPayment } from './SupplierPayment'
import { ReasonDialog } from '../../purchases/ReasonDialog'
import { useReversePayment } from '../../purchases/queries'
import { useToast } from '../../components/ui/toastContext'
import '../../purchases/purchases.css'

type Statement = components['schemas']['SupplierStatementOut']

/** One supplier: what you owe, what is overdue, every purchase and payment, and a statement that adds up. */
const ENTRY: Record<Statement['ledger'][number]['kind'], string> = { purchase: 'Purchase', payment: 'Payment', purchase_reversal: 'Purchase reversed', payment_reversal: 'Payment reversed' }
function entryLabel(e: Statement['ledger'][number], joiner = ' ') {
  const base = ENTRY[e.kind]
  return e.method && e.kind.startsWith('payment') ? `${base}${joiner === ' ' ? ` (${paymentMethod(e.method)})` : ` · ${paymentMethod(e.method)}`}` : base
}

export function SupplierDetailPage() {
  const { id = '' } = useParams()
  const { current, role } = useShop()
  const shop = current?.shop_id ?? ''
  const canEdit = can(role, 'products.edit')
  const suppliers = useSuppliers()
  const supplier = suppliers.data?.find(s => s.uuid === id)
  const statement = useQuery({ queryKey: ['supplier-statement', shop, id], enabled: !!shop && !!id, queryFn: () => api.get<Statement>(`/v1/shops/${shop}/suppliers/${id}/statement`) })
  const [paying, setPaying] = useState<null | { purchase?: { uuid: string; label: string }; owed: string }>(null)
  const [editing, setEditing] = useState(false)
  const [undoing, setUndoing] = useState<Statement['payments'][number] | null>(null)
  const toast = useToast()
  const reversePayment = useReversePayment(id)
  const s = statement.data
  const today = todayInShop()
  const missing = suppliers.data && !supplier

  function download() {
    if (!s || !supplier) return
    saveCsv(`${supplier.name} statement.csv`, [
      ['Date', 'Entry', 'Reference', 'Purchases', 'Payments', 'Balance'],
      ...s.ledger.map(e => [e.date, entryLabel(e), e.reference, e.debit === '0' ? '' : e.debit, e.credit === '0' ? '' : e.credit, e.balance]),
      ['', 'Balance owed', '', '', '', s.balance_due],
    ])
  }

  return <div className="supplier-detail">
    <p className="crumbs"><Link to="/suppliers">← Suppliers</Link></p>
    {(suppliers.isPending || statement.isPending) && !missing && <Loading label="Loading supplier…" />}
    {suppliers.error && <ErrorState error={suppliers.error} onRetry={() => void suppliers.refetch()} />}
    {missing && <Empty title="Supplier not found">It may have been removed. <Link to="/suppliers">Back to suppliers</Link></Empty>}
    {supplier && <>
      <PageHeader eyebrow="SUPPLIER" title={supplier.name} description={[supplier.phone, supplier.gstin && `GSTIN ${supplier.gstin}`, supplier.email].filter(Boolean).join(' · ') || undefined} actions={<>
        {canEdit && s && Number(s.balance_due) > 0 && <Button variant="primary" onClick={() => setPaying({ owed: s.balance_due })}>Record payment</Button>}
        {canEdit && <Link className="button secondary" to={`/purchases/new?supplier=${supplier.uuid}`}>Record purchase</Link>}
        {canEdit && <Button onClick={() => setEditing(true)}>Edit</Button>}
      </>} />
      {statement.isPending && <KpiSkeletons count={4} label="Loading supplier figures…" />}
      {statement.error && <ErrorState error={statement.error} onRetry={() => void statement.refetch()} />}
      {s && <>
        <div className="kpis purchase-kpis">
          <Kpi label="You owe" value={receiptMoney(s.balance_due)} note="Today" />
          <Kpi label="Overdue" value={receiptMoney(s.overdue)} tone={Number(s.overdue) > 0 ? 'bad' : undefined} note="Past its due date, today" />
          <Kpi label="Purchased" value={receiptMoney(s.purchased_total)} note="All time, with payment terms" />
          <Kpi label="Paid" value={receiptMoney(s.paid_total)} note="All time" />
        </div>
        {s.unrecorded_purchases > 0 && <Alert kind="info">{s.unrecorded_purchases} purchase{s.unrecorded_purchases === 1 ? ' has' : 's have'} no payment terms recorded and {s.unrecorded_purchases === 1 ? 'is' : 'are'} not counted above.</Alert>}

        <section className="card" aria-labelledby="sd-purchases">
          <h2 id="sd-purchases">Purchases</h2>
          {s.purchases.length === 0 ? <p className="muted">Nothing bought from this supplier yet.</p> : <div className="table-wrap"><table className="table">
            <thead><tr><th>Date</th><th>Invoice</th><th className="num">Total</th><th className="num hide-sm">Paid</th><th className="hide-sm">Due date</th><th className="num">Balance due</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{[...s.purchases].reverse().map(p => {
              const late = !!p.due_date && !p.reversed_at && p.due_date < today && Number(p.balance_due ?? '0') > 0
              const label = p.invoice_number ? `invoice ${p.invoice_number}` : `purchase of ${day(p.purchase_date)}`
              return <tr key={p.uuid} className={p.reversed_at ? 'reversed-row' : undefined}>
                <td className="nowrap"><Link to={`/purchases/${p.uuid}`} aria-label={`View ${label}`}>{day(p.purchase_date)}</Link></td>
                <td>{p.invoice_number ?? <span className="muted">—</span>}</td>
                <td className="num">{p.total == null ? <span className="muted">—</span> : receiptMoney(p.total)}</td>
                <td className="num hide-sm">{p.total == null ? <span className="muted">—</span> : receiptMoney(p.paid_amount)}</td>
                <td className="hide-sm nowrap">{p.due_date ? <>{day(p.due_date)}{late && <span className="payment-badge unpaid overdue-flag">Overdue</span>}</> : <span className="muted">—</span>}</td>
                <td className="num">{p.reversed_at ? <span className="payment-badge reversed">Reversed</span> : p.balance_due == null ? <span className="muted">Not recorded</span> : receiptMoney(p.balance_due)}{late && <small className="show-sm bad stacked-note">Overdue</small>}</td>
                <td className="row-actions">{canEdit && p.balance_due != null && Number(p.balance_due) > 0 && <button className="link" aria-label={`Pay ${label}`} onClick={() => setPaying({ owed: p.balance_due!, purchase: { uuid: p.uuid, label: label.replace(/^./, c => c.toUpperCase()) } })}>Pay</button>}</td>
              </tr>
            })}</tbody>
          </table></div>}
        </section>

        <section className="card" aria-labelledby="sd-payments">
          <h2 id="sd-payments">Payments</h2>
          {s.payments.length === 0 ? <p className="muted">No payments recorded.</p> : <div className="table-wrap"><table className="table">
            <thead><tr><th>Date</th><th className="num">Amount</th><th>Method</th><th>Applied to</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{[...s.payments].reverse().map(p => <tr key={p.uuid} className={p.reversed_at ? 'reversed-row' : undefined}>
              <td className="nowrap">{day(p.payment_date)}</td>
              <td className="num">{receiptMoney(p.amount)}</td>
              <td>{paymentMethod(p.payment_method)}{p.reference && <small className="stacked-note muted">{p.reference}</small>}</td>
              <td>{p.allocations?.length ? p.allocations.map(a => <span key={a.purchase_uuid} className="allocation"><Link to={`/purchases/${a.purchase_uuid}`}>{a.invoice_number ?? day(a.purchase_date)}</Link> {receiptMoney(a.amount)}</span>) : <span className="muted">—</span>}</td>
              <td className="row-actions">{p.reversed_at ? <span className="payment-badge reversed" title={p.reversal_reason ?? undefined}>Reversed</span> : canEdit && <button className="link" aria-label={`Reverse payment of ${receiptMoney(p.amount)} on ${day(p.payment_date)}`} onClick={() => setUndoing(p)}>Reverse</button>}</td>
            </tr>)}</tbody>
          </table></div>}
        </section>

        <section className="card" aria-labelledby="sd-statement">
          <div className="statement-head"><h2 id="sd-statement">Statement</h2>{s.ledger.length > 0 && <Button onClick={download}>Download statement (CSV)</Button>}</div>
          {s.ledger.length === 0 ? <p className="muted">No entries yet.</p> : <div className="table-wrap"><table className="table">
            <thead><tr><th>Date</th><th>Entry</th><th className="num">Purchases</th><th className="num">Payments</th><th className="num">Balance</th></tr></thead>
            <tbody>{s.ledger.map(e => <tr key={`${e.kind}:${e.uuid}`}>
              <td className="nowrap">{day(e.date)}</td>
              <td>{entryLabel(e, ' · ')}{e.reference && <small className="stacked-note muted">{e.reference}</small>}</td>
              <td className="num">{e.debit !== '0' ? receiptMoney(e.debit) : ''}</td>
              <td className="num">{e.credit !== '0' ? receiptMoney(e.credit) : ''}</td>
              <td className="num">{receiptMoney(e.balance)}</td>
            </tr>)}</tbody>
            <tfoot><tr><th scope="row" colSpan={4}>Balance owed</th><td className="num"><strong>{receiptMoney(s.balance_due)}</strong></td></tr></tfoot>
          </table></div>}
        </section>
      </>}
      {paying && <SupplierPayment supplier={supplier} owed={paying.owed} purchase={paying.purchase} onClose={() => setPaying(null)} />}
      {undoing && <ReasonDialog title="Reverse payment" confirmLabel="Reverse payment" onClose={() => setUndoing(null)}
        onConfirm={async reason => { await reversePayment.mutateAsync({ payment: undoing.uuid, reason }); toast('Payment reversed') }}
        effects={<>
          <p>The payment of <strong>{receiptMoney(undoing.amount)}</strong> on {day(undoing.payment_date)} stays on record, marked as reversed. Reversing it will:</p>
          <ul>{undoing.allocations?.map(a => <li key={a.purchase_uuid}>make {receiptMoney(a.amount)} owed again on {a.invoice_number ? `invoice ${a.invoice_number}` : `the purchase of ${day(a.purchase_date)}`},</li>)}<li>add it back to what you owe {supplier.name}.</li></ul>
        </>} />}
      {editing && <SupplierEditor supplier={supplier} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
    </>}
  </div>
}
