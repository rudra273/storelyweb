import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { ApiError } from '../api/client'
import { day, paymentMethod, paymentStatus } from '../components/labels'
import { Kpi } from '../components/ui/Kpi'
import { Alert, Loading } from '../components/ui/ui'
import { ErrorState } from '../components/ui/states'
import { ActionMenu, Button, PageHeader } from '../components/ui/workspace'
import { useToast } from '../components/ui/toastContext'
import { formatQty } from '../lib/money'
import { PURCHASE } from '../lib/vocabulary'
import { can } from '../permissions'
import { SupplierPayment } from '../products/suppliers/SupplierPayment'
import { useShop } from '../shops/context'
import { todayInShop } from './composer/draft'
import { receiptMoney } from './composer/money'
import { PaymentTermsDialog } from './PaymentTermsDialog'
import { PurchaseReturnDialog } from './PurchaseReturnDialog'
import { ReasonDialog } from './ReasonDialog'
import { useReceipt, useReversePurchase } from './queries'
import './purchases.css'

/** One purchase: what came in, what it cost, what was paid, what is still owed. */
export function PurchaseDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const back = (location.state as { from?: string } | null)?.from ?? '/purchases'
  const query = useReceipt(id)
  const { role } = useShop()
  const [paying, setPaying] = useState(false)
  const [returning, setReturning] = useState(false)
  const [reversing, setReversing] = useState(false)
  const [returnsBlocked, setReturnsBlocked] = useState(false)
  const [terms, setTerms] = useState(false)
  const toast = useToast()
  const reverse = useReversePurchase(id ?? '')
  const r = query.data
  const late = !!r?.due_date && !r.reversed_at && r.due_date < todayInShop() && Number(r.balance_due ?? '0') > 0
  const hasReturnableItems = !!r?.items.some(i => Number(i.returnable_quantity ?? i.quantity) > 0)
  const returns = r?.returns ?? []
  return <div className="purchase-detail">
    <p className="crumbs"><Link to={back}>← Purchase invoices</Link></p>
    {query.isPending && <Loading label="Loading purchase…" />}
    {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
    {r && <>
      <PageHeader eyebrow="PURCHASE" title={r.supplier_name ? `Purchase from ${r.supplier_name}` : 'Purchase with no supplier'} description={`Received ${day(r.purchase_date)}${r.invoice_number ? ` · Supplier invoice ${r.invoice_number}` : ''}`} actions={<>
        {!r.reversed_at && r.supplier_uuid && can(role, 'products.edit') && Number(r.balance_due ?? '0') > 0 && <Button variant="primary" onClick={() => setPaying(true)}>Pay supplier</Button>}
        {!r.reversed_at && can(role, 'products.edit') && hasReturnableItems && <Button onClick={() => setReturning(true)}>Return items</Button>}
        {r.supplier_uuid && <Link className="button secondary" to={`/suppliers/${r.supplier_uuid}`}>Supplier account</Link>}
        {!r.reversed_at && can(role, 'products.edit') && <ActionMenu><button type="button" onClick={() => { setReturnsBlocked(false); setReversing(true) }}>Reverse purchase…</button></ActionMenu>}
      </>} />
      {r.reversed_at && <Alert kind="info"><strong>This purchase was reversed on {day(r.reversed_at)}.</strong> Reason: {r.reversal_reason}. Its stock was taken back out and it is not counted in what you owe. {can(role, 'products.edit') && <Link to={`/purchases/new${r.supplier_uuid ? `?supplier=${r.supplier_uuid}` : ''}`}>Record the corrected purchase</Link>}</Alert>}
      <div className="kpis purchase-kpis">
        <Kpi label={PURCHASE.total} value={r.total == null ? null : receiptMoney(r.total)} note={r.total == null ? 'Payment terms were not recorded' : undefined} />
        <Kpi label={PURCHASE.paid} value={r.total == null ? null : receiptMoney(r.paid_amount ?? '0')} />
        <Kpi label={PURCHASE.balance} value={r.balance_due == null ? null : receiptMoney(r.balance_due)} tone={late ? 'bad' : undefined} note={r.due_date ? `${late ? 'Overdue since' : 'Due'} ${day(r.due_date)}` : undefined} />
        <Kpi label="Payment" value={r.reversed_at ? 'Reversed' : paymentStatus(r.payment_status)} />
      </div>
      {r.payment_status === 'not_recorded' && !r.reversed_at && <Alert kind="info">Payment is not recorded for this purchase, so it is not counted in what you owe the supplier. {!r.supplier_uuid ? 'It has no supplier, so what you owe cannot be recorded here. If you owe money for it, reverse it and record it again with the supplier.' : can(role, 'products.edit') && <button className="link" onClick={() => setTerms(true)}>Record payment terms</button>}</Alert>}
      <section className="card" aria-label="Items received">
        <h2>Items received</h2>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Product</th><th className="num">Quantity</th><th className="num">Unit cost</th><th className="num">Amount</th><th className="hide-sm">Batch / expiry</th></tr></thead>
          <tbody>{r.items.map(line => <tr key={line.uuid}>
            <td><Link to={`/products/${line.product_uuid}`}>{line.product_name}</Link></td>
            <td className="num">
              {formatQty(line.quantity)} {line.unit_name}
              {Number(line.returned_quantity ?? '0') > 0 && <small className="stacked-note muted">Returned {formatQty(line.returned_quantity)} {line.unit_name}</small>}
            </td>
            <td className="num">{receiptMoney(line.unit_cost)}</td>
            <td className="num">{receiptMoney(line.amount)}</td>
            <td className="hide-sm">{line.batch_no ?? '—'}{line.expiry_date && <><br /><small>Expires {day(line.expiry_date)}</small></>}</td>
          </tr>)}</tbody>
        </table></div>
      </section>
      <section className="card purchase-totals" aria-label="Totals">
        <h2>Totals</h2>
        <dl className="facts">
          <dt>{PURCHASE.items}</dt><dd>{receiptMoney(r.subtotal)}</dd>
          {r.total != null && <>
            <dt>{PURCHASE.gst}</dt><dd>{receiptMoney(r.tax_amount ?? '0')}</dd>
            <dt>{PURCHASE.charges}</dt><dd>{receiptMoney(r.charges_amount ?? '0')}</dd>
            <dt>{PURCHASE.discount}</dt><dd>−{receiptMoney(r.discount_amount ?? '0')}</dd>
            <dt><strong>{PURCHASE.total}</strong></dt><dd><strong>{receiptMoney(r.total)}</strong></dd>
          </>}
          {Number(r.returned_total ?? '0') > 0 && <><dt>Returned</dt><dd>−{receiptMoney(r.returned_total!)}</dd></>}
        </dl>
        {r.total != null && Number(r.subtotal) !== Number(r.total) && <p className="muted">{PURCHASE.costRule}</p>}
        {r.notes && <p><span className="muted">Notes:</span> {r.notes}</p>}
      </section>
      {returns.length > 0 && <section className="card" aria-label="Returns / Debit notes">
        <h2>Returns / Debit notes</h2>
        <ul className="plain return-list">{returns.map(ret => <li key={ret.uuid} className="return-entry">
          <div>
            <strong>{ret.return_number}</strong> · {day(ret.return_date)} · <strong>{receiptMoney(ret.total)}</strong>
            {' '}· Payable credit {receiptMoney(ret.payable_credit)}
            {Number(ret.refund_amount) > 0 && <> · Refund {receiptMoney(ret.refund_amount)}{ret.refund_method ? ` (${paymentMethod(ret.refund_method)})` : ''}</>}
          </div>
          <div className="muted">Reason: {ret.reason}</div>
          <ul className="plain return-entry-items">{ret.items.map(item => <li key={item.uuid}>
            {item.product_name} — {formatQty(item.quantity)} {item.unit_name} ({receiptMoney(item.amount)})
          </li>)}</ul>
        </li>)}</ul>
      </section>}
      <section className="card" aria-label="Payments">
        <h2>Payments</h2>
        {r.payments?.length ? <ul className="plain">{r.payments.map(p => <li key={p.uuid}>{day(p.payment_date)} · <strong>{receiptMoney(p.amount)}</strong> · {paymentMethod(p.payment_method)}{p.reference ? ` · ${p.reference}` : ''}</li>)}</ul> : <p className="muted">No payments recorded against this purchase.</p>}
      </section>
      {terms && <PaymentTermsDialog receipt={r} onClose={() => setTerms(false)} />}
      {returning && <PurchaseReturnDialog receipt={r} onClose={() => setReturning(false)} />}
      {reversing && <ReasonDialog title="Reverse purchase" confirmLabel="Reverse purchase" onClose={() => { setReversing(false); setReturnsBlocked(false) }}
        onConfirm={async reason => {
          try {
            await reverse.mutateAsync(reason)
            toast('Purchase reversed')
          } catch (e) {
            if (e instanceof ApiError && e.code === 'returns_recorded') setReturnsBlocked(true)
            throw e
          }
        }}
        help={returnsBlocked || returns.length > 0
          ? <p className="muted">Purchases with recorded returns (debit notes) cannot be reversed.</p>
          : r.payments?.length ? <p className="muted">Payments were made against this purchase. <Link to={`/suppliers/${r.supplier_uuid}`}>Open the supplier account</Link> to reverse them first.</p> : undefined}
        effects={<>
          <p>The purchase and its history stay on record. Reversing it will:</p>
          <ul>
            <li>take {r.items.length} item{r.items.length === 1 ? '' : 's'} back out of stock ({r.items.map(i => `${formatQty(i.quantity)} ${i.unit_name ?? ''} ${i.product_name}`.replace(/\s+/g, ' ')).join(', ')}),</li>
            {r.total != null && <li>take {receiptMoney(r.total)} off what you owe {r.supplier_name ?? 'the supplier'},</li>}
            {r.invoice_number && <li>free supplier invoice number {r.invoice_number} so the corrected purchase can use it.</li>}
          </ul>
          <p className="muted">It cannot be done if some of this stock has already been sold, if returns have been recorded, or if payments stand against it.</p>
        </>} />}
      {paying && r.supplier_uuid && <SupplierPayment supplier={{ uuid: r.supplier_uuid, name: r.supplier_name ?? 'supplier' }} owed={r.balance_due ?? '0'} purchase={{ uuid: r.uuid, label: r.invoice_number ? `Invoice ${r.invoice_number}` : `Purchase of ${day(r.purchase_date)}` }} onClose={() => setPaying(false)} />}
    </>}
  </div>
}
