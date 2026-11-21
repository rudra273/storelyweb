import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { components } from '../api/schema'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/toastContext'
import { Alert, Field } from '../components/ui/ui'
import { Button } from '../components/ui/workspace'
import { describeError, useAction } from '../components/useAction'
import { useDebounced } from '../lib/useDebounced'
import { PURCHASE } from '../lib/vocabulary'
import { useShop } from '../shops/context'
import type { Receipt } from './composer/contracts'
import { todayInShop } from './composer/draft'
import { receiptMoney } from './composer/money'
import { PURCHASE_VIEWS } from './queries'
import './purchases.css'

type Choice = 'unpaid' | 'partial' | 'paid'
type Terms = components['schemas']['TermsIn']
const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/
const METHODS = [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['bank_transfer', 'Bank transfer'], ['online', 'Online']] as const

/**
 * A purchase saved without payment terms is left out of what is owed. This records them, once, after the fact:
 * what the supplier's bill added or took off, when it is due, and whether any of it is already paid.
 * The total comes from the server before anything is posted.
 */
export function PaymentTermsDialog({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  const shop = useShop().current?.shop_id ?? ''
  const client = useQueryClient()
  const toast = useToast()
  const { busy, error, run } = useAction()
  const [f, setF] = useState({ tax: '', charges: '', discount: '', due: '', paid: '', date: todayInShop(), method: 'cash' as NonNullable<Terms['payment_method']> })
  const [choice, setChoice] = useState<Choice>('unpaid')
  const bad = (['tax', 'charges', 'discount'] as const).some(k => f[k] && !AMOUNT.test(f[k]))
    || (choice === 'partial' && (!AMOUNT.test(f.paid) || !/[1-9]/.test(f.paid)))
    || (!!f.due && f.due < receipt.purchase_date)
  const body: Partial<Terms> = {
    ...(f.tax ? { tax_amount: f.tax } : {}), ...(f.charges ? { charges_amount: f.charges } : {}), ...(f.discount ? { discount_amount: f.discount } : {}),
    ...(f.due && choice !== 'paid' ? { due_date: f.due } : {}),
    ...(choice === 'paid' ? { paid_in_full: true } : {}), ...(choice === 'partial' ? { paid_now: f.paid } : {}),
    ...(choice !== 'unpaid' ? { payment_method: f.method, payment_date: f.date } : {}),
  }
  const preview = JSON.stringify({
    items: receipt.items.map(i => ({ quantity: i.quantity, unit_cost: i.unit_cost })),
    ...(f.tax ? { tax_amount: f.tax } : {}), ...(f.charges ? { charges_amount: f.charges } : {}), ...(f.discount ? { discount_amount: f.discount } : {}),
    ...(choice === 'paid' ? { paid_in_full: true } : {}), ...(choice === 'partial' ? { paid_now: f.paid } : {}), record_payment_terms: true,
  })
  const settled = useDebounced(bad ? null : preview, 250)
  const review = useQuery({ queryKey: ['purchase-terms-preview', shop, settled], enabled: !!settled && !!shop, retry: false,
    queryFn: () => api.post<components['schemas']['ReceiptPreview']>(`/v1/shops/${shop}/purchase-receipts/preview`, JSON.parse(settled!)) })
  const current = !!review.data && !review.isFetching && settled === (bad ? null : preview) && !review.error

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (bad || busy || !current) return
    const done = await run(async () => {
      await api.post(`/v1/shops/${shop}/purchase-receipts/${receipt.uuid}/payment-terms`, body)
      for (const key of PURCHASE_VIEWS) await client.invalidateQueries({ queryKey: [key, shop] })
      return true
    })
    if (done) { toast('Payment terms recorded'); onClose() }
  }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  return <Modal title="Record payment terms" onClose={onClose} canClose={!busy} wide>
    <form onSubmit={submit} noValidate aria-busy={busy}>
      <p>This purchase from <strong>{receipt.supplier_name}</strong> was saved without payment terms, so it is not counted in what you owe. Enter what the supplier's bill shows. Once recorded, the amounts cannot be changed.</p>
      <fieldset disabled={busy} className="pw-fieldset">
        <div className="pw-fields">
          <Field label="GST amount (₹)" inputMode="decimal" value={f.tax} onChange={set('tax')} />
          <Field label="Other charges (₹)" inputMode="decimal" value={f.charges} onChange={set('charges')} />
          <Field label="Discount (₹)" inputMode="decimal" value={f.discount} onChange={set('discount')} />
        </div>
        <p className="muted">{PURCHASE.costRule}</p>
        <div className="pw-choices" role="radiogroup" aria-label="Payment">
          {([['unpaid', 'Not paid yet', 'You owe the whole total.'], ['partial', 'Paid part now', 'You owe the rest.'], ['paid', 'Paid in full', 'Nothing is owed.']] as const).map(([value, label, note]) => <label key={value} className={`pw-choice${choice === value ? ' on' : ''}`}>
            <input type="radio" name="terms-choice" value={value} checked={choice === value} onChange={() => setChoice(value)} />
            <span><strong>{label}</strong><small className="muted">{note}</small></span>
          </label>)}
        </div>
        <div className="pw-fields">
          {choice === 'partial' && <Field label="Paid now (₹)" inputMode="decimal" value={f.paid} onChange={set('paid')} />}
          {choice !== 'unpaid' && <Field label="Payment date" type="date" min={receipt.purchase_date} max={todayInShop()} value={f.date} onChange={set('date')} />}
          {choice !== 'unpaid' && <div className="field"><label htmlFor="terms-method">Payment method</label><select id="terms-method" value={f.method} onChange={set('method')}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
          {choice !== 'paid' && <Field label="Due date (optional)" type="date" min={receipt.purchase_date} value={f.due} onChange={set('due')} />}
        </div>
      </fieldset>
      <section className="card pw-review" aria-live="polite" aria-label="Review">
        {bad ? <p className="muted">Check the amounts: up to two decimal places{choice === 'partial' ? ', and an amount paid' : ''}.</p>
          : review.error ? <Alert>{describeError(review.error)}</Alert>
          : !current ? <p className="muted">Calculating the total…</p>
          : <dl className="pw-totals">
            <dt>{PURCHASE.items}</dt><dd>{receiptMoney(review.data!.subtotal)}</dd>
            {Number(review.data!.tax_amount) > 0 && <><dt>{PURCHASE.gst}</dt><dd>{receiptMoney(review.data!.tax_amount)}</dd></>}
            {Number(review.data!.charges_amount) > 0 && <><dt>{PURCHASE.charges}</dt><dd>{receiptMoney(review.data!.charges_amount)}</dd></>}
            {Number(review.data!.discount_amount) > 0 && <><dt>{PURCHASE.discount}</dt><dd>−{receiptMoney(review.data!.discount_amount)}</dd></>}
            <dt className="pw-grand">{PURCHASE.total}</dt><dd className="pw-grand"><strong>{receiptMoney(review.data!.total)}</strong></dd>
            <dt>Paid now</dt><dd>{receiptMoney(review.data!.paid_now)}</dd>
            <dt className="pw-grand">{PURCHASE.balance}</dt><dd className="pw-grand"><strong>{receiptMoney(review.data!.balance_due)}</strong></dd>
          </dl>}
      </section>
      {error && <Alert>{error}</Alert>}
      <div className="actions"><Button disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={busy || bad || !current}>{busy ? 'Recording…' : 'Record payment terms'}</Button></div>
    </form>
  </Modal>
}
