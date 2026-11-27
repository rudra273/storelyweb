import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../api/client'
import { useAuth } from '../../auth/context'
import { useShop } from '../../shops/context'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toastContext'
import { Alert, Field } from '../../components/ui/ui'
import { Button } from '../../components/ui/workspace'
import { describeError } from '../../components/useAction'
import { todayInShop } from '../../purchases/composer/draft'
import { receiptMoney } from '../../purchases/composer/money'
import { FinancialStorageError } from '../../lib/financialStorage'
import { openPaymentAttempt, type SupplierPaymentAttempt } from './paymentAttemptStore'
import { Link } from 'react-router'
import { PURCHASE_VIEWS } from '../../purchases/queries'

type Payment = SupplierPaymentAttempt
const METHODS = [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['bank_transfer', 'Bank transfer'], ['online', 'Online']] as const

/**
 * Pay a supplier. Without `purchase` the payment settles the oldest purchases first; with it, only that purchase.
 * The request is kept on this browser until the server answers, so an uncertain result is retried as the same payment, never a second one.
 */
interface SupplierPaymentProps {
  supplier: { uuid: string; name: string }
  /** What is owed: the whole balance, or for one purchase its balance. Shown, never calculated here. */
  owed: string
  purchase?: { uuid: string; label: string }
  onClose: () => void
}

export function SupplierPayment(props: SupplierPaymentProps) {
  const shop = useShop().current?.shop_id ?? ''
  const user = useAuth().user?.id ?? ''
  return <SupplierPaymentForm key={`${user}/${shop}/${props.supplier.uuid}/${props.purchase?.uuid ?? ''}`} {...props} />
}

function SupplierPaymentForm({ supplier, owed, purchase, onClose }: SupplierPaymentProps) {
  const shop = useShop().current?.shop_id ?? ''
  const user = useAuth().user?.id ?? ''
  const toast = useToast()
  const client = useQueryClient()
  const [store] = useState(() => openPaymentAttempt(user, shop, supplier.uuid))
  const [pending, setPending] = useState<Payment | null>(store.initial)
  const [blocked, setBlocked] = useState(!!store.initialError)
  const [amount, setAmount] = useState(store.initial?.amount ?? '')
  const [date, setDate] = useState(store.initial?.payment_date ?? todayInShop())
  const [method, setMethod] = useState<Payment['payment_method']>(store.initial?.payment_method ?? 'cash')
  const [reference, setReference] = useState(store.initial?.reference ?? '')
  const [notes, setNotes] = useState(store.initial?.notes ?? '')
  const [error, setError] = useState<string | null>(store.initialError?.message ?? null)
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (sending.current || blocked) return
    if (!pending && (!/^\d{1,12}(\.\d{1,2})?$/.test(amount) || !/[1-9]/.test(amount))) { setError('Enter an amount greater than zero with up to two decimal places.'); return }
    sending.current = true
    setBusy(true)
    setError(null)
    const wasUncertain = pending !== null
    const body: Payment = pending ?? { request_key: crypto.randomUUID(), payment_date: date, amount, payment_method: method, reference: reference.trim() || null, notes: notes.trim() || null, ...(purchase ? { purchase_uuid: purchase.uuid } : {}) }
    let sent = false
    try {
      await store.save(body, () => mounted.current)
      if (!mounted.current) return
      setPending(body)
      sent = true
      await api.post(`/v1/shops/${shop}/suppliers/${supplier.uuid}/payments`, body)
      await store.clear(() => mounted.current)
      if (!mounted.current) return
      setPending(null)
      for (const key of PURCHASE_VIEWS) await client.invalidateQueries({ queryKey: [key, shop] })
      if (!mounted.current) return
      toast('Payment recorded')
      onClose()
    } catch (e) {
      if (!mounted.current) return
      // Only the first fresh send's validation refusal proves no payment committed.
      // A restored/previously uncertain request remains frozen even after a new 422.
      if (sent && !wasUncertain && e instanceof ApiError && e.status === 422) {
        try { await store.clear(() => mounted.current); if (mounted.current) setPending(null) }
        catch (cleanup) { if (mounted.current) setError(cleanup instanceof FinancialStorageError ? cleanup.message : describeError(cleanup)); return }
      }
      if (e instanceof FinancialStorageError && e.kind !== 'storage') setBlocked(true)
      setError(e instanceof ApiError && e.code === 'legacy_payment_intent_unknown'
        ? 'This older payment cannot be safely matched to the selected purchase. Review the original supplier statement before proceeding. Keep this request; do not record a new payment to replace it.'
        : e instanceof FinancialStorageError ? e.message : describeError(e))
    } finally { sending.current = false; if (mounted.current) setBusy(false) }
  }

  return <Modal title={`Pay ${supplier.name}`} onClose={onClose} canClose={!busy}>
    <form onSubmit={submit} noValidate aria-busy={busy}>
      {pending ? <p>Restoring a payment of <strong>{receiptMoney(pending.amount)}</strong>. {pending.purchase_uuid ? <Link to={`/purchases/${pending.purchase_uuid}`}>Review its original purchase</Link> : 'It settles the oldest purchases first.'}</p> : <p>{purchase ? <>Paying <strong>{purchase.label}</strong>. Still owed on it: <strong>{receiptMoney(owed)}</strong>.</> : <>You owe <strong>{receiptMoney(owed)}</strong>. A payment settles the oldest purchases first.</>}</p>}
      {error && <Alert>{error}</Alert>}
      {pending && <Alert kind="info">A payment is awaiting confirmation. Retry it to find out whether it was recorded, before entering another.</Alert>}
      <fieldset disabled={busy || !!pending || blocked} className="pay-fields">
        <Field label="Amount (₹)" inputMode="decimal" autoFocus value={amount} onChange={e => setAmount(e.target.value)} required />
        <button type="button" className="link" onClick={() => setAmount(owed.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''))}>Pay all {receiptMoney(owed)}</button>
        <Field label="Payment date" type="date" max={todayInShop()} value={date} onChange={e => setDate(e.target.value)} required />
        <div className="field"><label htmlFor="pay-method">Payment method</label><select id="pay-method" value={method} onChange={e => setMethod(e.target.value as Payment['payment_method'])}>{METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <Field label="Reference (optional)" maxLength={100} value={reference} onChange={e => setReference(e.target.value)} />
        <Field label="Notes (optional)" maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} />
      </fieldset>
      <div className="actions"><Button disabled={busy} onClick={onClose}>{pending ? 'Close' : 'Cancel'}</Button><Button type="submit" variant="primary" disabled={busy || blocked}>{busy ? 'Recording…' : pending ? 'Retry payment' : 'Record payment'}</Button></div>
    </form>
  </Modal>
}
