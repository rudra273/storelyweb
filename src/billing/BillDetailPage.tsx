import { PageHeader } from '../components/ui/workspace'
import { useToast } from '../components/ui/toastContext'
import { billAction, day, paymentMethod, paymentStatus } from '../components/labels'
import { when } from '../components/format'
import { useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError, api, request } from '../api/client'
import type { components } from '../api/schema'
import { useDebounced } from '../lib/useDebounced'
import { Modal } from '../components/ui/Modal'
import { Alert, Field, Loading } from '../components/ui/ui'
import { describeError } from '../components/useAction'
import { formatMoney, formatQty } from '../lib/money'
import { can } from '../permissions'
import { useShop } from '../shops/context'
import { Invoice } from './invoice/Invoice'
type ReturnPreview = components['schemas']['ReturnPreview']
import { useBillingMutation, useBillingQuery, type BillDetail, type PaymentInput, type CreditInput } from './queries'

export function BillDetailPage() {
  const { id } = useParams()
  const { current } = useShop()
  const query = useBillingQuery<BillDetail>('bill', `bills/${encodeURIComponent(id ?? '')}`, !!id)
  return <>
    <Link className="no-print" to="/billing">Back to bills</Link>
    {query.isPending && <Loading />}
    {query.error && <Alert>{describeError(query.error)} <button className="link" onClick={() => void query.refetch()}>Retry</button></Alert>}
    {query.data && <Detail key={`${current?.shop_id}/${id}`} detail={query.data} />}
  </>
}

function Detail({ detail }: { detail: BillDetail }) {
  const { role } = useShop()
  const [action, setAction] = useState<'payment' | 'cancel' | 'return' | null>(null)
  const [printing, setPrinting] = useState(false)
  const b = detail.bill
  return <>
    <div className="no-print"><PageHeader eyebrow="BILL DETAILS" title={b.bill_number} description={`${b.customer_name} · ${day(b.created_at)} · ${b.cancelled ? 'Cancelled' : paymentStatus(b.payment_status)}`} /></div>
    {b.cancelled && <Alert kind="info">Cancelled: {b.cancel_reason}</Alert>}
    <div className="actions no-print">
      <button onClick={() => setPrinting(!printing)}>{printing ? 'Close invoice' : 'Invoice / Print / PDF'}</button>
      {!b.cancelled && b.document_type !== 'credit_note' && <>
        {Number(b.balance_due) > 0 && <button className="primary" onClick={() => setAction('payment')}>Record payment</button>}
        {can(role, 'billing.cancel') && <button onClick={() => setAction('return')}>Return items</button>}
      </>}
      {!b.cancelled && can(role, 'billing.cancel') && <button className="danger-button" onClick={() => setAction('cancel')}>Cancel {b.document_type === 'credit_note' ? 'credit note' : 'bill'}</button>}
    </div>
    {printing ? <Invoice detail={detail} /> : <div className="bill-screen bill-detail-grid">
      <div className="table-wrap"><table className="table"><thead><tr><th>Item</th><th>Quantity</th><th>Unit price</th><th>Taxable</th><th>GST</th><th>Amount</th></tr></thead><tbody>{detail.items.map(i => <tr key={i.uuid}><td>{i.product_name}</td><td>{formatQty(i.quantity)} {i.unit}</td><td>{formatMoney(i.selling_price)}</td><td>{formatMoney(i.line_taxable_value)}</td><td>{formatMoney(i.line_gst)}</td><td>{formatMoney(i.amount)}</td></tr>)}</tbody></table></div>
      <section className="card bill-detail-totals"><h2>Totals</h2><dl className="bill-totals">{[['Subtotal', b.subtotal_amount], ['Discount', b.discount_amount], ['Taxable amount', b.taxable_amount], ['CGST', b.cgst_amount], ['SGST', b.sgst_amount], ['IGST', b.igst_amount], ['Round-off', b.round_off_amount], ['Total', b.total_amount], ['Paid', b.paid_amount], ['Due', b.balance_due]].map(([k, v]) => <div className="row" key={k}><dt>{k}</dt><dd>{formatMoney(v)}</dd></div>)}</dl></section>
      <section className="card"><h2>Payments</h2>{detail.payments.length ? <ul className="plain">{detail.payments.map(p => <li className="row" key={p.uuid}><span>{day(p.received_at)} · {paymentMethod(p.payment_method)}<br /><small className="muted">{[p.payment_reference, p.notes].filter(Boolean).join(' · ')}</small></span><strong>{formatMoney(p.amount)}</strong></li>)}</ul> : <p>No payments recorded.</p>}</section>
      {!!b.original_bill_uuid && <p>Against invoice <Link to={`/billing/${b.original_bill_uuid}`}>{b.original_bill_number}</Link></p>}
      {!!detail.credit_notes.length && <section className="card"><h2>Credit notes</h2>{detail.credit_notes.map(n => <p key={n.uuid}><Link to={`/billing/${n.uuid}`}>{n.bill_number}</Link> · {formatMoney(n.total_amount)}</p>)}</section>}
      <section className="card"><h2>History</h2>{detail.history.length ? <ul className="plain">{detail.history.map((h, i) => <li className="row" key={i}><span>{billAction(h.action)}{h.actor ? ` · ${h.actor}` : ''}<br /><small className="muted">{h.details}</small></span><small>{when(h.created_at)}</small></li>)}</ul> : <p>No activity yet.</p>}</section>
    </div>}
    {action && <BillAction key={action} action={action} detail={detail} close={() => setAction(null)} />}
  </>
}

function BillAction({ action, detail, close }: { action: 'payment' | 'cancel' | 'return'; detail: BillDetail; close: () => void }) {
  const navigate = useNavigate()
  const [amount, setAmount] = useState(detail.bill.balance_due)
  const [method, setMethod] = useState<PaymentInput['method']>('cash')
  const [reason, setReason] = useState('')
  const [reference, setReference] = useState('')
  const [settlement, setSettlement] = useState<CreditInput['settlement']>('refund')
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  type Attempt = { body: PaymentInput | CreditInput | { reason: string }; key?: string }
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const sending = useRef(false)
  const toast = useToast()
  const shop = useShop().current?.shop_id ?? ''
  // The server prices the return (earlier returns, tax, round-off) before anything is saved.
  const picked = Object.fromEntries(Object.entries(quantities).filter(([, q]) => Number(q) > 0))
  const pickedKey = JSON.stringify([picked, settlement])
  const settledKey = useDebounced(pickedKey, 250)
  const review = useQuery({
    queryKey: ['return-preview', shop, detail.bill.uuid, settledKey],
    queryFn: () => api.post<ReturnPreview>(`/v1/shops/${shop}/bills/${detail.bill.uuid}/credit-note/preview`, { quantities: JSON.parse(settledKey)[0], settlement: JSON.parse(settledKey)[1] }),
    enabled: action === 'return' && !attempt, retry: false,
  })
  const reviewCurrent = review.data && !review.isFetching && settledKey === pickedKey && !review.error
  const mutation = useBillingMutation(async (base: string, input: Attempt) => request<BillDetail>('POST', `${base}/bills/${detail.bill.uuid}/${action === 'payment' ? 'payments' : action === 'return' ? 'credit-note' : 'cancel'}`, { body: input.body, idempotencyKey: input.key }))
  const uncertainCancel = action === 'cancel' && mutation.error instanceof ApiError && (mutation.error.status === 0 || mutation.error.status >= 500)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (sending.current || uncertainCancel) return
    const body = action === 'payment' ? { amount, method, reference: reference || null, notes: reason || null } : action === 'cancel' ? { reason } : { quantities: Object.fromEntries(Object.entries(quantities).filter(([, q]) => Number(q) > 0)), settlement, refund_method: method, reason: reason || null }
    const next = attempt ?? { body, key: action === 'cancel' ? undefined : crypto.randomUUID() }
    if (action !== 'cancel') setAttempt(next)
    sending.current = true
    try {
      const result = await mutation.mutateAsync(next)
      close()
      toast(action === 'payment' ? 'Payment recorded' : action === 'return' ? `Return saved as ${result.bill.bill_number}` : 'Bill cancelled')
      if (action === 'return') void navigate(`/billing/${result.bill.uuid}`)
    } catch (error) {
      if (error instanceof ApiError && (error.status === 422 || (error.status === 409 && error.code !== 'idempotency_conflict'))) setAttempt(null)
    } finally { sending.current = false }
  }
  const title = action === 'payment' ? 'Record payment' : action === 'cancel' ? 'Cancel document' : 'Return items'
  return <Modal title={title} canClose={!mutation.isPending && !attempt} onClose={() => { if (!mutation.isPending && !attempt) close() }}><form onSubmit={submit}><fieldset disabled={mutation.isPending || !!attempt}>
    {action === 'cancel' && <Alert kind="info">This cancels the document and reverses its stock movements.</Alert>}
    {action === 'payment' && <Field label="Amount (₹)" type="number" min="0.01" max={detail.bill.balance_due} step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} />}
    {action === 'return' && <>
      <p>Enter how many of each item are coming back. Returns are credited at the price originally charged.</p>
      {detail.items.map(i => { const row = review.data?.lines.find(l => l.item_uuid === i.uuid); return <Field key={i.uuid} label={`Return ${i.product_name}`} type="number" min="0" max={row?.remaining ?? i.quantity} step="0.001" value={quantities[i.uuid] ?? ''} hint={row ? `Sold ${formatQty(row.sold)} · returned before ${formatQty(row.already_returned)} · can return ${formatQty(row.remaining)}` : undefined} onChange={e => setQuantities({ ...quantities, [i.uuid]: e.target.value })} /> })}
      <label>Settlement<select value={settlement} onChange={e => setSettlement(e.target.value as typeof settlement)}><option value="refund">Refund customer</option><option value="adjust">Reduce invoice due</option></select></label>
      {review.error && <Alert>{describeError(review.error)}</Alert>}
      {Object.keys(picked).length > 0 && !review.error && <section aria-label="Return summary" aria-live="polite">
        {!reviewCurrent ? <Loading label="Calculating the credit…" /> : <dl className="bill-totals">
          {[['Items', review.data.subtotal], ['Tax', review.data.tax_amount], ['Round-off', review.data.round_off_amount]].map(([k, v]) => <div className="row" key={k}><dt>{k}</dt><dd>{formatMoney(v!)}</dd></div>)}
          <div className="row grand-total"><dt>Credit note total</dt><dd>{formatMoney(review.data.credit_total)}</dd></div>
          {settlement === 'refund'
            ? <div className="row"><dt>Refund to customer</dt><dd>{formatMoney(review.data.refund_to_customer)}</dd></div>
            : <div className="row"><dt>Invoice due</dt><dd>{formatMoney(review.data.invoice_due)} → {formatMoney(review.data.invoice_due_after)}</dd></div>}
        </dl>}
        {reviewCurrent && review.data.lines.some(l => Number(l.returning) > 0 && l.goes_back_to_stock) && <p className="muted">Returned items are added back to stock.</p>}
      </section>}
    </>}
    {action !== 'cancel' && <label>Payment method<select value={method} onChange={e => setMethod(e.target.value as typeof method)}>{['cash', 'upi', 'card', 'bank', 'online'].map(m => <option key={m} value={m}>{paymentMethod(m)}</option>)}</select></label>}
    {action === 'payment' && <Field label="Reference" maxLength={100} value={reference} onChange={e => setReference(e.target.value)} />}
    <Field label={action === 'payment' ? 'Notes' : 'Reason'} maxLength={200} value={reason} onChange={e => setReason(e.target.value)} />
    </fieldset>{mutation.error && <Alert>{describeError(mutation.error)} {attempt ? 'Details are locked. Retry to safely confirm the original request.' : 'Check the bill before trying again if the connection was interrupted.'}</Alert>}
    <div className="actions"><button className={action === 'cancel' ? 'danger-button' : 'primary'} disabled={mutation.isPending || uncertainCancel || (action === 'return' && !attempt && !(Object.keys(picked).length > 0 && reviewCurrent && review.data.can_return))}>{mutation.isPending ? 'Saving…' : attempt ? `Retry ${action === 'payment' ? 'payment' : 'return'}` : title}</button><button type="button" disabled={mutation.isPending || !!attempt} onClick={close}>Close</button></div>
  </form></Modal>
}
