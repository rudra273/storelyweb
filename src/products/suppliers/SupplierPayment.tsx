import { useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../api/client'
import type { components } from '../../api/schema'
import { useAuth } from '../../auth/context'
import { useShop } from '../../shops/context'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/toastContext'
import { Alert, Field } from '../../components/ui/ui'
import { Button } from '../../components/ui/workspace'
import { describeError } from '../../components/useAction'
import { todayInShop } from '../../purchases/composer/draft'
import { receiptMoney } from '../../purchases/composer/money'
import { PURCHASE_VIEWS } from '../../purchases/queries'

type Payment = components['schemas']['SupplierPaymentIn']
const METHODS = [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['bank_transfer', 'Bank transfer'], ['online', 'Online']] as const

/**
 * Pay a supplier. Without `purchase` the payment settles the oldest purchases first; with it, only that purchase.
 * The request is kept on this browser until the server answers, so an uncertain result is retried as the same payment, never a second one.
 */
export function SupplierPayment({ supplier, owed, purchase, onClose }: {
  supplier: { uuid: string; name: string }
  /** What is owed: the whole balance, or for one purchase its balance. Shown, never calculated here. */
  owed: string
  purchase?: { uuid: string; label: string }
  onClose: () => void
}) {
  const shop = useShop().current?.shop_id ?? ''
  const user = useAuth().user?.id ?? ''
  const toast = useToast()
  const client = useQueryClient()
  const storageKey = `storely.supplier-payment:${user}:${shop}:${supplier.uuid}${purchase ? `:${purchase.uuid}` : ''}`
  const [pending, setPending] = useState<Payment | null>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Payment | null } catch { return null }
  })
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayInShop())
  const [method, setMethod] = useState<Payment['payment_method']>('cash')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (sending.current) return
    if (!pending && (!/^\d{1,12}(\.\d{1,2})?$/.test(amount) || !/[1-9]/.test(amount))) { setError('Enter an amount greater than zero with up to two decimal places.'); return }
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      const body: Payment = pending ?? { request_key: crypto.randomUUID(), payment_date: date, amount, payment_method: method, reference: reference.trim() || null, ...(purchase ? { purchase_uuid: purchase.uuid } : {}) }
      localStorage.setItem(storageKey, JSON.stringify(body))
      setPending(body)
      await api.post(`/v1/shops/${shop}/suppliers/${supplier.uuid}/payments`, body)
      localStorage.removeItem(storageKey)
      setPending(null)
      for (const key of PURCHASE_VIEWS) await client.invalidateQueries({ queryKey: [key, shop] })
      toast('Payment recorded')
      onClose()
    } catch (e) {
      // A definite refusal frees the form; anything uncertain keeps the saved request for a safe retry.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.code !== 'request_conflict' && e.status !== 408) {
        localStorage.removeItem(storageKey)
        setPending(null)
      }
      setError(describeError(e))
    } finally { sending.current = false; setBusy(false) }
  }

  return <Modal title={`Pay ${supplier.name}`} onClose={onClose} canClose={!busy}>
    <form onSubmit={submit} noValidate aria-busy={busy}>
      <p>{purchase ? <>Paying <strong>{purchase.label}</strong>. Still owed on it: <strong>{receiptMoney(owed)}</strong>.</> : <>You owe <strong>{receiptMoney(owed)}</strong>. A payment settles the oldest purchases first.</>}</p>
      {error && <Alert>{error}</Alert>}
      {pending && <Alert kind="info">A payment is awaiting confirmation. Retry it to find out whether it was recorded, before entering another.</Alert>}
      <fieldset disabled={busy || !!pending} className="pay-fields">
        <Field label="Amount (₹)" inputMode="decimal" autoFocus value={amount} onChange={e => setAmount(e.target.value)} required />
        <button type="button" className="link" onClick={() => setAmount(owed.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''))}>Pay all {receiptMoney(owed)}</button>
        <Field label="Payment date" type="date" max={todayInShop()} value={date} onChange={e => setDate(e.target.value)} required />
        <div className="field"><label htmlFor="pay-method">Payment method</label><select id="pay-method" value={method} onChange={e => setMethod(e.target.value as Payment['payment_method'])}>{METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <Field label="Reference (optional)" maxLength={100} value={reference} onChange={e => setReference(e.target.value)} />
      </fieldset>
      <div className="actions"><Button disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Recording…' : pending ? 'Retry payment' : 'Record payment'}</Button></div>
    </form>
  </Modal>
}
