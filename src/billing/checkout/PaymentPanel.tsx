import { Field } from '../../components/ui/ui'
import { balanceAfter, formatMoney } from '../../lib/money'
import { paymentMinorUnits } from './settlement'
import type { BillInput } from '../queries'

export type Method = BillInput['payment']['method']
export type Paid = 'full' | 'part' | 'none'
export const PAY_FULL_ID = 'pay-full'

const METHODS: { value: Method; label: string }[] = [
  { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank transfer' }, { value: 'online', label: 'Online' },
]

export interface PaymentFields { paid: Paid | null; amount: string; method: Method; reference: string; cash: string }

/** Exact paise change for a valid 2-decimal rupee amount strictly above total; counter-only. */
function cashChange(received: string, owed: string): string | null {
  const cashPaise = paymentMinorUnits(received)
  const totalPaise = paymentMinorUnits(owed)
  if (cashPaise === null || totalPaise === null || cashPaise <= totalPaise) return null
  const diff = cashPaise - totalPaise
  return `${diff / 100n}.${String(diff % 100n).padStart(2, '0')}`
}

/** How the customer paid. Nothing is chosen for the cashier, and picking UPI or card only
 * records how it was paid: Storely does not take or confirm the payment. */
export function PaymentPanel({ total, value, onChange, error, disabled }: {
  total: string | undefined
  value: PaymentFields
  onChange: (next: PaymentFields) => void
  error: string
  disabled: boolean
}) {
  const set = (patch: Partial<PaymentFields>) => onChange({ ...value, ...patch })
  const change = value.paid === 'full' && value.method === 'cash' && total ? cashChange(value.cash, total) : null
  const left = value.paid === 'part' && total ? balanceAfter(total, value.amount) : null
  return <fieldset className="payment-choice" disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={error ? 'paid-error' : undefined}>
    <legend className="required-label">Payment</legend>
    <div className="pay-options">
      {([['full', 'Paid in full'], ['part', 'Part paid'], ['none', 'Not paid yet']] as const).map(([option, label]) =>
        <label key={option} className="check pay-option"><input id={option === 'full' ? PAY_FULL_ID : undefined} type="radio" name="paid" value={option} checked={value.paid === option} onChange={() => set({ paid: option })} />{label}</label>)}
    </div>
    {value.paid === 'part' && <Field label="Paid now (₹)" inputMode="decimal" required value={value.amount} onChange={e => set({ amount: e.target.value })} hint={left ? `Balance ${formatMoney(left)} stays due.` : undefined} />}
    {value.paid && value.paid !== 'none' && <>
      <div className="pay-detail">
        <label>Paid by<select value={value.method} onChange={e => set({ method: e.target.value as Method })}>{METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
        {value.method === 'cash'
          ? value.paid === 'full' && <Field label="Cash received" inputMode="decimal" placeholder="Optional" value={value.cash} onChange={e => set({ cash: e.target.value })} />
          : <Field label="Reference" maxLength={100} placeholder="Optional" value={value.reference} onChange={e => set({ reference: e.target.value })} />}
      </div>
      {value.method !== 'cash' && <small className="hint">Records how it was paid. Storely does not collect or confirm this payment.</small>}
      {change && <p className="change-due" role="status">Change to return <strong>{formatMoney(change)}</strong></p>}
    </>}
    {error && <small id="paid-error" className="field-error" role="alert">{error}</small>}
  </fieldset>
}
