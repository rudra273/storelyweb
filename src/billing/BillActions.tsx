import { useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { ApiError, api, request } from '../api/client'
import type { components } from '../api/schema'
import { paymentMethod } from '../components/labels'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/toastContext'
import { Alert, Field, Loading } from '../components/ui/ui'
import { describeError } from '../components/useAction'
import { useDirtyClose, useIsDirty } from '../lib/dirty'
import { formatMoney, formatQty } from '../lib/money'
import { useDebounced } from '../lib/useDebounced'
import { ACTION } from '../lib/vocabulary'
import { useShop } from '../shops/context'
import { documentKind } from './documentStatus'
import { useBillingMutation, type BillDetail, type CreditInput, type PaymentInput } from './queries'

type ReturnPreview = components['schemas']['ReturnPreview']
export type BillActionKind = 'payment' | 'cancel' | 'return'

/** Record payment, Return items and Void invoice: one dialog shell, each with its own review. */
export function BillAction({ action, detail, close }: { action: BillActionKind; detail: BillDetail; close: () => void }) {
  const navigate = useNavigate()
  const [amount, setAmount] = useState(detail.bill.balance_due)
  const [method, setMethod] = useState<PaymentInput['method']>('cash')
  const [reason, setReason] = useState('')
  const [reference, setReference] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [settlement, setSettlement] = useState<CreditInput['settlement']>('refund')
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  type Attempt = { body: PaymentInput | CreditInput | { reason: string }; key?: string }
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const sending = useRef(false)
  const toast = useToast()
  const leave = useDirtyClose(useIsDirty([amount, method, reason, reference, settlement, quantities]) && !attempt, close)
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
    if ((action === 'cancel' || action === 'return') && reason.trim().length < 3) { setReasonError(action === 'cancel' ? 'Say why this is being voided, so the record explains it later.' : 'Say why the items are coming back.'); return }
    setReasonError('')
    const body = action === 'payment' ? { amount, method, reference: method === 'cash' ? null : reference.trim() || null, notes: reason || null } : action === 'cancel' ? { reason: reason.trim() } : { quantities: Object.fromEntries(Object.entries(quantities).filter(([, q]) => Number(q) > 0)), settlement, refund_method: method, reason: reason.trim() || null }
    const next = attempt ?? { body, key: action === 'cancel' ? undefined : crypto.randomUUID() }
    if (action !== 'cancel') setAttempt(next)
    sending.current = true
    try {
      const result = await mutation.mutateAsync(next)
      close()
      toast(action === 'payment' ? 'Payment recorded' : action === 'return' ? `Return saved as ${result.bill.bill_number}` : `${documentKind(detail.bill)} voided`)
      if (action === 'return') void navigate(`/billing/${result.bill.uuid}`)
    } catch (error) {
      if (error instanceof ApiError && (error.status === 422 || (error.status === 409 && error.code !== 'idempotency_conflict'))) setAttempt(null)
    } finally { sending.current = false }
  }
  const kind = documentKind(detail.bill).toLowerCase()
  const title = action === 'payment' ? 'Record payment' : action === 'cancel' ? `Void ${kind}` : 'Return items'
  return <Modal title={title} canClose={!mutation.isPending && !attempt} onClose={() => { if (!mutation.isPending && !attempt) leave() }}><form onSubmit={submit}><fieldset disabled={mutation.isPending || !!attempt}>
    {action === 'cancel' && <VoidImpact detail={detail} />}
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
    <Field label={action === 'payment' ? 'Notes' : action === 'cancel' ? 'Reason for voiding' : 'Reason for the return'} required={action !== 'payment'} maxLength={200} value={reason} error={reasonError || undefined} onChange={e => { setReason(e.target.value); setReasonError('') }} />
    </fieldset>{mutation.error && <Alert>{describeError(mutation.error)} {attempt ? 'Details are locked. Retry to safely confirm the original request.' : 'Check the bill before trying again if the connection was interrupted.'}</Alert>}
    <div className="actions sticky-actions"><button className={action === 'cancel' ? 'danger-button' : 'primary'} disabled={mutation.isPending || uncertainCancel || (action === 'cancel' && detail.credit_notes.length > 0) || (action === 'return' && !attempt && !(Object.keys(picked).length > 0 && reviewCurrent && review.data.can_return))}>{mutation.isPending ? 'Saving…' : attempt ? `Retry ${action === 'payment' ? 'payment' : 'return'}` : title}</button><button type="button" disabled={mutation.isPending || !!attempt} onClick={leave}>{ACTION.cancel}</button></div>
  </form></Modal>
}

/** What voiding will do, said before it is confirmed. The invoice and its number stay on record. */
function VoidImpact({ detail }: { detail: BillDetail }) {
  const b = detail.bill
  const isNote = b.document_type === 'credit_note'
  const stocked = detail.items.filter(i => i.product_uuid).length
  if (detail.credit_notes.length) return <Alert>This invoice has {detail.credit_notes.length === 1 ? 'a credit note' : 'credit notes'} ({detail.credit_notes.map(n => n.bill_number).join(', ')}). Void {detail.credit_notes.length === 1 ? 'it' : 'them'} first.</Alert>
  return <section className="void-impact" aria-label="What voiding does">
    <p><strong>{b.bill_number}</strong> will stay on record as voided, with your reason. Nothing is deleted.</p>
    <ul>
      {stocked > 0 && <li>{isNote ? `The returned items of ${stocked} ${stocked === 1 ? 'product' : 'products'} leave stock again.` : `Stock for ${stocked} ${stocked === 1 ? 'product' : 'products'} goes back to the shelf.`}</li>}
      {!isNote && Number(b.paid_amount) > 0 && <li>{formatMoney(b.paid_amount)} of recorded payments is taken out of your reports. Storely does not refund money: give it back to the customer yourself.</li>}
      {!isNote && Number(b.balance_due) > 0 && <li>The {formatMoney(b.balance_due)} still due is removed from the customer's account.</li>}
      {isNote && <li>If this credit was applied to {b.original_bill_number ?? 'the invoice'}, that invoice's balance goes back up.</li>}
    </ul>
  </section>
}
