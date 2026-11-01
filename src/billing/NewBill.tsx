import { PageHeader } from '../components/ui/workspace'
import { useToast } from '../components/ui/toastContext'
import { useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { ApiError, api } from '../api/client'
import { Alert, Empty, Field, Loading } from '../components/ui/ui'
import { describeError } from '../components/useAction'
import { formatMoney, isAmount } from '../lib/money'
import { useDebounced } from '../lib/useDebounced'
import { STATE_OPTIONS } from '../lib/states'
import { gstinProblem, phoneProblem } from '../lib/validate'
import { useProducts, type Product } from '../products/queries'
import { useShop } from '../shops/context'
import { can } from '../permissions'
import { CustomItemEditor, type CustomLine } from './CustomItem'
import { createBill, useBillingMutation, useBillingQuery, type BillInput, type CartInput, type Customer, type Preview } from './queries'

const METHODS: { value: BillInput['payment']['method']; label: string }[] = [
  { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank transfer' }, { value: 'online', label: 'Online' },
]

export function NewBill() {
  const { current } = useShop()
  // A shop switch discards this component's cart and in-flight UI state.
  return <BillForm key={current?.shop_id} />
}

function BillForm() {
  const { current, role } = useShop()
  const shop = current!.shop_id
  const canCustom = can(role, 'billing.custom')
  const [custom, setCustom] = useState<CustomLine[]>([])
  const [addingCustom, setAddingCustom] = useState(false)
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<{ product: Product; quantity: string }[]>([])
  const [customer, setCustomer] = useState({ customer_name: '', customer_phone: '', customer_gstin: '', customer_gst_legal_name: '', customer_gst_trade_name: '', customer_address: '', place_of_supply_state_code: '' })
  const [billType, setBillType] = useState<'b2c' | 'b2b'>('b2c')
  const [discount, setDiscount] = useState('0')
  // No default: the cashier says how the customer paid, so an unpaid bill is never an accident.
  const [paid, setPaid] = useState<'full' | 'part' | 'none' | null>(null)
  const [amount, setAmount] = useState('')
  const [paidError, setPaidError] = useState('')
  const [method, setMethod] = useState<BillInput['payment']['method']>('cash')
  const [reference, setReference] = useState('')
  const [attempt, setAttempt] = useState<{ body: BillInput; key: string } | null>(null)
  const sending = useRef(false)
  const toast = useToast()
  const mutation = useBillingMutation(createBill)
  const products = useProducts({ q: useDebounced(search, 250), category: '', low: false, expiring: false, sort: 'name', dir: 'asc', page: 0 })
  const customerSearch = useDebounced(customer.customer_name, 300)
  // Customer details are checked here as they are typed: a half-typed GSTIN must not reach
  // the price check (it would refuse the whole cart) or the saved bill.
  const [checkCustomer, setCheckCustomer] = useState(false)
  const gstin = customer.customer_gstin.trim()
  const customerErrors = {
    phone: phoneProblem(customer.customer_phone),
    gstin: billType === 'b2b' && !gstin ? "A business (B2B) bill needs the customer's GSTIN." : gstinProblem(gstin),
  }
  const shownErrors = {
    phone: checkCustomer || customer.customer_phone.replace(/\D/g, '').length >= 10 ? customerErrors.phone : null,
    gstin: checkCustomer || gstin.length >= 15 ? customerErrors.gstin : null,
  }
  const customers = useBillingQuery<Customer[]>('customers', `customers?q=${encodeURIComponent(customerSearch)}`, customerSearch.trim().length >= 2)
  const cart: CartInput = { ...customer, customer_phone: customerErrors.phone ? null : customer.customer_phone, customer_gstin: gstinProblem(gstin) ? null : gstin || null, place_of_supply_state_code: customer.place_of_supply_state_code || null, bill_type: billType, discount_percent: discount, items: [...items.map(i => ({ product_uuid: i.product.uuid, quantity: i.quantity })), ...custom.map(c => ({ name: c.name, quantity: c.quantity, unit_price: c.unit_price, gst_percent: c.gst_percent, cost: c.cost || null, hsn_code: c.hsn_code || null, unit: c.unit || null }))] }
  const lineCount = items.length + custom.length
  // The server prices catalogue lines first, then the other lines in the order added.
  const preview = useQuery({ queryKey: ['bill-preview', shop, cart], queryFn: () => api.post<Preview>(`/v1/shops/${shop}/bills/preview`, cart), enabled: lineCount > 0 && [...items, ...custom].every(i => Number(i.quantity) > 0) && !attempt, retry: false })
  const locked = !!attempt || mutation.isPending
  // A cart the server refused (not enough stock, a whole-unit item): retrying cannot help.
  const cartProblem = preview.error instanceof ApiError && preview.error.status === 422
  const customPreview = preview.data?.lines?.filter(l => l.product_uuid === null) ?? []
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (sending.current || (!attempt && (!preview.data || preview.isFetching || preview.error))) return
    let paidNow = '0'
    if (!attempt && (customerErrors.phone || customerErrors.gstin)) {
      setCheckCustomer(true)
      // The GSTIN sits in a section that opens on this render; focus once it is shown.
      setTimeout(() => document.querySelector<HTMLInputElement>(`input[name="${customerErrors.phone ? 'customer_phone' : 'customer_gstin'}"]`)?.focus())
      return
    }
    if (!attempt) {
      const total = preview.data!.total
      if (!paid) return setPaidError('Choose how the customer paid: in full, part or not yet.')
      if (paid === 'part' && (!isAmount(amount) || Number(amount) <= 0 || Number(amount) >= Number(total))) return setPaidError(`Enter the amount paid now: more than ₹0 and less than ${formatMoney(total)}.`)
      paidNow = paid === 'full' ? total : paid === 'part' ? amount : '0'
    }
    setPaidError('')
    sending.current = true
    const next = attempt ?? { body: { ...cart, payment: { amount: paidNow, method, reference: paid === 'none' ? null : reference || null } }, key: crypto.randomUUID() }
    setAttempt(next)
    try {
      const result = await mutation.mutateAsync(next)
      void navigate(`/billing/${result.bill.uuid}`, { replace: true })
      toast(`Bill ${result.bill.bill_number} created`)
    } catch (error) {
      // A rejected validation has rolled back. An unknown outcome keeps the key
      // and exact payload so a retry cannot charge or reduce stock twice.
      if (error instanceof ApiError && (error.status === 422 || (error.status === 409 && error.code !== 'idempotency_conflict'))) setAttempt(null)
    }
    finally { sending.current = false }
  }
  return <div className="checkout-page">
    <PageHeader eyebrow="BILLING / NEW BILL" title="New bill" description="Add your items, review the total and record payment." actions={<Link className="button secondary" to="/billing">← Back to bills</Link>} />
    <form className="checkout-grid" onSubmit={submit}>
      <fieldset className="checkout-main" disabled={locked}>
        <section className="card wide"><div className="checkout-section-title"><span>01</span><h2>Customer</h2></div><p className="muted">Add a name or leave blank for a walk-in customer.</p><div className="form-grid">
          <Field label="Customer name" maxLength={120} value={customer.customer_name} onChange={e => setCustomer({ ...customer, customer_name: e.target.value })} />
          <Field label="Phone" type="tel" inputMode="tel" maxLength={20} placeholder="98765 43210" hint="Optional. With a phone number the bill is added to the customer's account." name="customer_phone" error={shownErrors.phone ?? undefined} value={customer.customer_phone} onChange={e => setCustomer({ ...customer, customer_phone: e.target.value })} />
        </div>
        {customers.isFetching && <Loading label="Finding customers…" />}
        {customers.error && <Alert>{describeError(customers.error)}</Alert>}
        {!!customers.data?.length && <ul className="plain">{customers.data.map(c => <li key={c.uuid}><button type="button" className="link" onClick={() => setCustomer({ customer_name: c.name, customer_phone: c.phone ?? '', customer_gstin: c.gstin ?? '', customer_gst_legal_name: c.gst_legal_name ?? '', customer_gst_trade_name: c.gst_trade_name ?? '', customer_address: c.address ?? '', place_of_supply_state_code: c.place_of_supply_state_code ?? '' })}>{c.name} · {c.phone || 'No phone'}</button></li>)}</ul>}
        <label>Bill type<select value={billType} onChange={e => setBillType(e.target.value as 'b2c' | 'b2b')}><option value="b2c">Consumer (B2C)</option><option value="b2b">Business (B2B)</option></select></label>
        <details className="tax-details" open={billType === 'b2b' || shownErrors.gstin ? true : undefined}><summary>Tax details and address</summary><div className="form-grid">
          <Field label="GSTIN" maxLength={15} required={billType === 'b2b'} placeholder="27ABCDE1234F1Z5" name="customer_gstin" error={shownErrors.gstin ?? undefined} value={customer.customer_gstin} onChange={e => setCustomer({ ...customer, customer_gstin: e.target.value.toUpperCase() })} />
          <Field label="GST legal name" maxLength={150} value={customer.customer_gst_legal_name} onChange={e => setCustomer({ ...customer, customer_gst_legal_name: e.target.value })} />
          <Field label="GST trade name" maxLength={150} value={customer.customer_gst_trade_name} onChange={e => setCustomer({ ...customer, customer_gst_trade_name: e.target.value })} />
          <label>Place of supply<select value={customer.place_of_supply_state_code} onChange={e => setCustomer({ ...customer, place_of_supply_state_code: e.target.value })}><option value="">{gstin && !gstinProblem(gstin) ? 'From the GSTIN' : 'Same as the shop'}</option>{STATE_OPTIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
          <Field label="Address" maxLength={300} value={customer.customer_address} onChange={e => setCustomer({ ...customer, customer_address: e.target.value })} />
        </div></details></section>
        <section className="card wide"><div className="checkout-section-title"><span>02</span><h2>Items <small>{lineCount ? `(${lineCount})` : ''}</small></h2>{canCustom && <button type="button" className="link checkout-custom" disabled={locked || lineCount >= 200} onClick={() => setAddingCustom(true)}>+ Item not in the list</button>}</div><Field label="Find product or barcode" type="search" value={search} onChange={e => setSearch(e.target.value)} />
          {products.isPending && <Loading />}{products.error && <Alert>{describeError(products.error)}</Alert>}
          {products.data && <><ul className="product-picker plain">{products.data.items.map(p => <li key={p.uuid}><button type="button" className="link" disabled={items.some(i => i.product.uuid === p.uuid) || lineCount >= 200} onClick={() => setItems([...items, { product: p, quantity: '1' }])}>{[p.name, p.barcode || p.product_code, formatMoney(p.selling_price)].filter(Boolean).join(' · ')}</button></li>)}</ul>{!products.data.items.length && <Empty title="No matching products" />}</>}
          {!lineCount && <div className="cart-empty"><strong>Your bill starts here</strong><p>Choose a product above to add it to this bill{canCustom ? ', or add an item that is not in the list' : ''}.</p></div>}
          <div className="table-wrap cart-table"><table className="table"><thead><tr><th>Product</th><th>Quantity</th><th className="num">Price</th><th className="num">Amount</th><th>Action</th></tr></thead><tbody>{items.map((i, index) => { const line = preview.data?.lines?.find(l => l.product_uuid === i.product.uuid); return <tr key={i.product.uuid}><td>{i.product.name}</td><td><input aria-label={`Quantity for ${i.product.name}`} type="number" min="0.001" max="1000000" step="0.001" required value={i.quantity} onChange={e => setItems(items.map((row, n) => n === index ? { ...row, quantity: e.target.value } : row))} /></td><td className="num">{line ? formatMoney(line.unit_price) : '—'}</td><td className="num">{line ? formatMoney(line.amount) : '—'}</td><td><button type="button" className="link" aria-label={`Remove ${i.product.name}`} onClick={() => setItems(items.filter((_, n) => n !== index))}>Remove</button></td></tr> })}{custom.map((c, index) => { const line = customPreview[index]; return <tr key={c.key}><td>{c.name} <span className="badge">Not in list · GST {c.gst_percent}%</span></td><td><input aria-label={`Quantity for ${c.name}`} type="number" min="0.001" max="1000000" step="0.001" required value={c.quantity} onChange={e => setCustom(custom.map((row, n) => n === index ? { ...row, quantity: e.target.value } : row))} /></td><td className="num">{line ? formatMoney(line.unit_price) : '—'}</td><td className="num">{line ? formatMoney(line.amount) : '—'}</td><td><button type="button" className="link" aria-label={`Remove ${c.name}`} onClick={() => setCustom(custom.filter((_, n) => n !== index))}>Remove</button></td></tr> })}</tbody></table></div>
          {cartProblem && <Alert>{describeError(preview.error)} Change the quantity or remove the item.</Alert>}
          <Field label="Discount (%)" type="number" min="0" max="100" step="0.01" required value={discount} onChange={e => setDiscount(e.target.value)} />
        </section>
      </fieldset>
      <aside className="checkout-summary" aria-label="Bill summary">
      {!lineCount && <section className="card wide"><h2>Bill summary</h2><p className="muted">Your totals and payment options will appear here when you add an item.</p></section>}
      {lineCount > 0 && <section className="card wide"><div className="checkout-section-title"><span>03</span><h2>Bill summary</h2></div><p className="muted">Review pricing and payment before saving.</p>{preview.isFetching && <Loading label="Pricing this cart…" />}{preview.error && <Alert>{describeError(preview.error)} {!cartProblem && <button type="button" className="link" onClick={() => void preview.refetch()}>Retry pricing</button>}</Alert>}
        {preview.data && !preview.isFetching && !preview.error && <><dl className="bill-totals">{[['Subtotal', preview.data.subtotal], ['Discount', preview.data.discount_amount], ['Taxable', preview.data.taxable_amount], ['CGST', preview.data.cgst_amount], ['SGST', preview.data.sgst_amount], ['IGST', preview.data.igst_amount], ['Round-off', preview.data.round_off_amount], ['Total', preview.data.total]].map(([k, v]) => <div className={k === 'Total' ? 'row grand-total' : 'row'} key={k}><dt>{k}</dt><dd>{formatMoney(v)}</dd></div>)}</dl></>}
        {items.some(i => { const line = preview.data?.lines?.find(line => line.product_uuid === i.product.uuid); return line && i.product.mrp_price != null && Number(line.unit_price) > Number(i.product.mrp_price) }) && <Alert kind="info">A product’s selling price is above its MRP. Check the price before creating the bill.</Alert>}
        <fieldset className="payment-choice" disabled={locked} aria-invalid={paidError ? true : undefined} aria-describedby={paidError ? 'paid-error' : undefined}>
          <legend className="required-label">Payment received</legend>
          {([['full', `Paid in full${preview.data ? ` (${formatMoney(preview.data.total)})` : ''}`], ['part', 'Part paid'], ['none', 'Not paid yet']] as const).map(([value, label]) => <label key={value} className="check"><input type="radio" name="paid" value={value} checked={paid === value} onChange={() => { setPaid(value); setPaidError('') }} />{label}</label>)}
          {paid === 'part' && <Field label="Paid now (₹)" inputMode="decimal" required autoFocus value={amount} onChange={e => { setAmount(e.target.value); setPaidError('') }} />}
          {paidError && <small id="paid-error" className="field-error" role="alert">{paidError}</small>}
          {paid && paid !== 'none' && <div className="form-grid"><label>Payment method<select value={method} onChange={e => setMethod(e.target.value as typeof method)}>{METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label><Field label="Payment reference (optional)" maxLength={100} value={reference} onChange={e => setReference(e.target.value)} /></div>}
        </fieldset>
      </section>}
      {mutation.error && <Alert>{describeError(mutation.error)} {attempt ? 'Your cart is locked. Retry to safely retrieve or create this same bill.' : 'Check your cart and try again.'}</Alert>}
      <div className="actions checkout-submit"><button className="primary" disabled={mutation.isPending || (!attempt && (!preview.data || !!preview.error || preview.isFetching || !lineCount))}>{mutation.isPending ? 'Saving…' : attempt ? 'Retry saving bill' : 'Create bill'}</button></div>
      </aside>
    </form>
    {addingCustom && <CustomItemEditor onClose={() => setAddingCustom(false)} onAdd={line => { setCustom([...custom, line]); setAddingCustom(false) }} />}
  </div>
}
