import { useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../api/client'
import type { components } from '../../api/schema'
import { useShop } from '../../shops/context'
import { useAuth } from '../../auth/context'
import { Modal } from '../../components/ui/Modal'
import { Alert, Field, Loading } from '../../components/ui/ui'
import { Button } from '../../components/ui/workspace'
import { describeError } from '../../components/useAction'
import { day, paymentStatus } from '../../components/labels'
import { receiptMoney } from '../../purchases/composer/money'
import { todayInShop } from '../../purchases/composer/draft'
import { PURCHASE_VIEWS } from '../../purchases/queries'
import type { Supplier } from '../queries'

type Statement = components['schemas']['SupplierStatementOut']
type Payment = components['schemas']['SupplierPaymentIn']
export function SupplierStatement({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const shop = useShop().current?.shop_id ?? ''
  const user = useAuth().user?.id ?? ''
  const storageKey = `storely.supplier-payment:${user}:${shop}:${supplier.uuid}`
  const path = `/v1/shops/${shop}/suppliers/${supplier.uuid}`
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['supplier-statement', shop, supplier.uuid], queryFn: () => api.get<Statement>(`${path}/statement`) })
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
      const body: Payment = pending ?? { request_key: crypto.randomUUID(), payment_date: date, amount, payment_method: method, reference: reference.trim() || null }
      localStorage.setItem(storageKey, JSON.stringify(body))
      setPending(body)
      await api.post(`${path}/payments`, body)
      localStorage.removeItem(storageKey)
      setPending(null)
      setAmount('')
      for (const key of PURCHASE_VIEWS) await client.invalidateQueries({ queryKey: [key, shop] })
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        localStorage.removeItem(storageKey)
        setPending(null)
      }
      setError(describeError(e))
    }
    finally { sending.current = false; setBusy(false) }
  }
  return <Modal title={supplier.name} onClose={onClose} canClose={!busy} wide>
    {query.isPending && <Loading />}
    {query.error && <Alert>Statement could not be loaded. <button onClick={() => void query.refetch()}>Retry</button></Alert>}
    {query.data && <>
      <p>Balance due: <strong>{receiptMoney(query.data.balance_due)}</strong></p>
      <div className="table-wrap"><table className="table"><thead><tr><th>Purchase date</th><th>Invoice</th><th>Payment</th><th>Total</th><th>Due</th></tr></thead><tbody>{query.data.purchases.map(p => <tr key={p.uuid}><td>{day(p.purchase_date)}</td><td>{p.invoice_number ?? '—'}</td><td>{paymentStatus(p.payment_status)}</td><td>{p.total === null ? '—' : receiptMoney(p.total)}</td><td>{p.balance_due === null ? 'Not recorded' : receiptMoney(p.balance_due)}</td></tr>)}</tbody></table></div>
      {query.data.purchases.length === 0 && <p>No purchases recorded.</p>}
      <h3>Record payment</h3>
      <form onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        {pending && <p>A payment is awaiting confirmation. Retry it to resolve the result before recording another payment.</p>}
        <fieldset disabled={busy || !!pending}>
          <Field label="Amount (₹)" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} required />
          <Field label="Payment date" type="date" max={todayInShop()} value={date} onChange={e => setDate(e.target.value)} required />
          <label>Payment method<select value={method} onChange={e => setMethod(e.target.value as Payment['payment_method'])}>{(['cash', 'upi', 'card', 'bank_transfer', 'online'] as const).map(m => <option key={m} value={m}>{({ cash: 'Cash', upi: 'UPI', card: 'Card', bank_transfer: 'Bank transfer', online: 'Online' })[m]}</option>)}</select></label>
          <Field label="Reference (optional)" maxLength={100} value={reference} onChange={e => setReference(e.target.value)} />
        </fieldset>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Recording…' : pending ? 'Retry payment' : 'Record payment'}</Button>
      </form>
      <h3>Payments</h3>
      {query.data.payments.length === 0 && <p>No payments recorded.</p>}
      <ul className="plain">{query.data.payments.map(p => <li key={p.uuid}>{day(p.payment_date)} · {receiptMoney(p.amount)} · {p.reference ?? p.payment_method}</li>)}</ul>
    </>}
  </Modal>
}
