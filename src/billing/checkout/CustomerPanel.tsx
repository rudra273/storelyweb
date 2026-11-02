import { Alert, Field, Loading } from '../../components/ui/ui'
import { describeError } from '../../components/useAction'
import { useDebounced } from '../../lib/useDebounced'
import { STATE_OPTIONS } from '../../lib/states'
import { gstinProblem } from '../../lib/validate'
import { useBillingQuery, type Customer } from '../queries'
import { BLANK_CUSTOMER, fromCustomer, type BillType, type CustomerFields } from './customerFields'

/** The customer is optional: a compact row says "Walk-in customer" until someone is added.
 * One name-or-phone search finds saved customers; business (B2B) details open only when chosen. */
export function CustomerPanel({ customer, onChange, billType, onBillType, errors, open, onOpen, disabled }: {
  customer: CustomerFields
  onChange: (next: CustomerFields) => void
  billType: BillType
  onBillType: (type: BillType) => void
  errors: { phone: string | null; gstin: string | null }
  open: boolean
  onOpen: (open: boolean) => void
  disabled: boolean
}) {
  const named = customer.customer_name.trim() !== ''
  const phoneDigits = customer.customer_phone.replace(/\D/g, '')
  // Typing either a name or a phone number finds the saved customer.
  const term = useDebounced(customer.customer_name.trim().length >= 2 ? customer.customer_name.trim() : phoneDigits.length >= 3 ? phoneDigits : '', 300)
  const found = useBillingQuery<Customer[]>('customers', `customers?q=${encodeURIComponent(term)}`, open && term !== '')
  const gstin = customer.customer_gstin.trim()
  const set = (key: keyof CustomerFields) => (e: { target: { value: string } }) => onChange({ ...customer, [key]: e.target.value })
  const hasAny = named || customer.customer_phone.trim() !== ''

  if (!open) return <section className="card checkout-customer" aria-label="Customer">
    <div className="customer-row">
      {hasAny
        ? <span className="customer-name"><strong>{customer.customer_name.trim() || customer.customer_phone}</strong>{named && <small className="muted"> · {customer.customer_phone.trim() || 'No phone'}</small>}{billType === 'b2b' && <span className="badge warn">Business</span>}</span>
        : <span className="muted">Walk-in customer</span>}
      <span className="customer-actions">
        <button type="button" className="link" disabled={disabled} onClick={() => onOpen(true)}>{hasAny ? 'Change' : 'Add customer'}</button>
        {hasAny && <button type="button" className="link" disabled={disabled} onClick={() => { onChange(BLANK_CUSTOMER); onBillType('b2c') }}>Remove</button>}
      </span>
    </div>
  </section>

  return <section className="card checkout-customer" aria-label="Customer">
    <div className="customer-row"><strong>Customer</strong><button type="button" className="link" onClick={() => onOpen(false)} disabled={!!(errors.phone || errors.gstin)}>Done</button></div>
    <div className="form-grid">
      <Field label="Name" maxLength={120} autoFocus autoComplete="off" value={customer.customer_name} onChange={set('customer_name')} />
      <Field label="Phone" type="tel" inputMode="tel" maxLength={20} placeholder="98765 43210" name="customer_phone" error={errors.phone ?? undefined} value={customer.customer_phone} onChange={set('customer_phone')} />
    </div>
    <p className="muted customer-hint">With a phone number the invoice is added to the customer's account. Leave both empty for a walk-in.</p>
    {found.isFetching && <Loading label="Finding customers…" />}
    {found.error && <Alert>{describeError(found.error)}</Alert>}
    {!!found.data?.length && <ul className="plain customer-results" aria-label="Saved customers">{found.data.slice(0, 5).map(c => <li key={c.uuid}><button type="button" className="link" onClick={() => { onChange(fromCustomer(c)); if (c.gstin) onBillType('b2b'); onOpen(false) }}>{c.name} · {c.phone || 'No phone'}</button></li>)}</ul>}
    <fieldset className="bill-type"><legend>Customer type</legend>
      <label className="check"><input type="radio" name="bill_type" checked={billType === 'b2c'} onChange={() => onBillType('b2c')} />Consumer</label>
      <label className="check"><input type="radio" name="bill_type" checked={billType === 'b2b'} onChange={() => onBillType('b2b')} />Business (GST invoice)</label>
    </fieldset>
    {billType === 'b2b' && <div className="form-grid">
      <Field label="GSTIN" required maxLength={15} placeholder="27ABCDE1234F1Z5" name="customer_gstin" error={errors.gstin ?? undefined} value={customer.customer_gstin} onChange={e => onChange({ ...customer, customer_gstin: e.target.value.toUpperCase() })} />
      <Field label="GST legal name" maxLength={150} value={customer.customer_gst_legal_name} onChange={set('customer_gst_legal_name')} />
      <Field label="GST trade name" maxLength={150} value={customer.customer_gst_trade_name} onChange={set('customer_gst_trade_name')} />
      <label>Place of supply<select value={customer.place_of_supply_state_code} onChange={set('place_of_supply_state_code')}><option value="">{gstin && !gstinProblem(gstin) ? 'From the GSTIN' : 'Same as the shop'}</option>{STATE_OPTIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
      <Field label="Address" maxLength={300} value={customer.customer_address} onChange={set('customer_address')} />
    </div>}
  </section>
}
