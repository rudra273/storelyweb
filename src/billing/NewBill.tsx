import { PageHeader } from '../components/ui/workspace'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ApiError, api } from '../api/client'
import { Alert } from '../components/ui/ui'
import { describeError } from '../components/useAction'
import { useAuth } from '../auth/context'
import { clearDraft, loadDraft, saveDraft } from '../lib/drafts'
import { formatMoney, formatQty, isAmount } from '../lib/money'
import { useDebounced } from '../lib/useDebounced'
import { SALES } from '../lib/vocabulary'
import { gstinProblem, phoneProblem } from '../lib/validate'
import { ProductForm } from '../products/components/ProductForm'
import type { Product } from '../products/queries'
import { useShop } from '../shops/context'
import { can } from '../permissions'
import { CustomItemEditor, type CustomLine } from './CustomItem'
import { addOrIncrement, MAX_LINES, outOfStock, stockProblem, stockText, type CartItem } from './checkout/cart'
import { Completion } from './checkout/Completion'
import { CustomerPanel } from './checkout/CustomerPanel'
import { BLANK_CUSTOMER, type BillType, type CustomerFields } from './checkout/customerFields'
import { PAY_FULL_ID, PaymentPanel, type PaymentFields } from './checkout/PaymentPanel'
import { ScanBox } from './checkout/ScanBox'
import { READY, type Status } from './checkout/scanStatus'
import { createBill, useBillingMutation, type BillDetail, type BillInput, type CartInput, type Preview } from './queries'

export function NewBill() {
  const { current } = useShop()
  const [round, setRound] = useState(0)
  // A shop switch, or "New invoice" on the completion screen, starts from a clean cart.
  return <BillForm key={`${current?.shop_id}/${round}`} another={() => setRound(round + 1)} />
}

/** What survives a reload. `attempt` is an invoice whose save may or may not have reached the
 * server: its exact body and retry key are kept so a retry replays the same operation. */
interface BillDraft {
  items: CartItem[]
  custom: CustomLine[]
  customer: CustomerFields
  billType: BillType
  discount: string
  paid: PaymentFields['paid']
  amount: string
  method: PaymentFields['method']
  reference: string
  attempt: { body: BillInput; key: string } | null
}

function BillForm({ another }: { another: () => void }) {
  const { current, role } = useShop()
  const shop = current!.shop_id
  const userId = useAuth().user?.id ?? ''
  const [restored, setRestored] = useState(() => loadDraft<BillDraft>('bill', userId, shop))
  const saved = restored?.data
  const canCustom = can(role, 'billing.custom')
  const canCreateProduct = can(role, 'products.edit')
  const [custom, setCustom] = useState<CustomLine[]>(saved?.custom ?? [])
  const [addingCustom, setAddingCustom] = useState(false)
  const [creating, setCreating] = useState<string | null>(null)
  const [unknown, setUnknown] = useState<string | null>(null)
  const [scanStatus, setScanStatus] = useState<Status>(READY)
  const [items, setItems] = useState<CartItem[]>(saved?.items ?? [])
  // Scans can arrive faster than a render, so the latest cart is also kept here.
  const itemsNow = useRef(items)
  const commit = (next: CartItem[]) => { itemsNow.current = next; setItems(next) }
  const [customer, setCustomer] = useState(saved?.customer ?? BLANK_CUSTOMER)
  const [customerOpen, setCustomerOpen] = useState(false)
  const [billType, setBillType] = useState<BillType>(saved?.billType ?? 'b2c')
  const [discount, setDiscount] = useState(saved?.discount ?? '0')
  // No default: the cashier says how the customer paid, so an unpaid invoice is never an accident.
  const [payment, setPayment] = useState<PaymentFields>({ paid: saved?.paid ?? null, amount: saved?.amount ?? '', method: saved?.method ?? 'cash', reference: saved?.reference ?? '', cash: '' })
  const [paidError, setPaidError] = useState('')
  const [attempt, setAttempt] = useState<{ body: BillInput; key: string } | null>(saved?.attempt ?? null)
  const [done, setDone] = useState<BillDetail | null>(null)
  const sending = useRef(false)
  const draftText = JSON.stringify({ items, custom, customer, billType, discount, paid: payment.paid, amount: payment.amount, method: payment.method, reference: payment.reference, attempt } satisfies BillDraft)
  useEffect(() => {
    if (done || !userId) return
    const draft = JSON.parse(draftText) as BillDraft
    if (!draft.items.length && !draft.custom.length && !draft.customer.customer_name.trim() && !draft.customer.customer_phone.trim() && !draft.attempt) clearDraft('bill', userId, shop)
    else saveDraft('bill', userId, shop, draft)
  }, [draftText, userId, shop, done])
  function discard() {
    commit([]); setCustom([]); setCustomer(BLANK_CUSTOMER); setBillType('b2c'); setDiscount('0')
    setPayment({ paid: null, amount: '', method: 'cash', reference: '', cash: '' }); setPaidError('')
    clearDraft('bill', userId, shop)
    setRestored(null)
  }
  const mutation = useBillingMutation(createBill)

  // Customer details are checked as they are typed: a half-typed GSTIN must not reach
  // the price check (it would refuse the whole cart) or the saved invoice.
  const [checkCustomer, setCheckCustomer] = useState(false)
  const gstin = customer.customer_gstin.trim()
  const customerErrors = {
    phone: phoneProblem(customer.customer_phone),
    gstin: billType === 'b2b' && !gstin ? "A business invoice needs the customer's GSTIN." : gstinProblem(gstin),
  }
  const shownErrors = {
    phone: checkCustomer || customer.customer_phone.replace(/\D/g, '').length >= 10 ? customerErrors.phone : null,
    gstin: checkCustomer || gstin.length >= 15 ? customerErrors.gstin : null,
  }
  const lines = [...items.map(i => ({ product_uuid: i.product.uuid, quantity: i.quantity })), ...custom.map(c => ({ name: c.name, quantity: c.quantity, unit_price: c.unit_price, gst_percent: c.gst_percent, cost: c.cost || null, hsn_code: c.hsn_code || null, unit: c.unit || null }))]
  const cart: CartInput = { ...customer, customer_phone: customerErrors.phone ? null : customer.customer_phone, customer_gstin: gstinProblem(gstin) ? null : gstin || null, place_of_supply_state_code: customer.place_of_supply_state_code || null, bill_type: billType, discount_percent: discount, items: lines }
  const lineCount = items.length + custom.length
  // Only what changes the price asks the server again; typing a name or phone does not.
  const pricedText = JSON.stringify({ bill_type: billType, discount_percent: discount, customer_gstin: cart.customer_gstin, place_of_supply_state_code: cart.place_of_supply_state_code, items: lines })
  const settledText = useDebounced(pricedText, 300)
  const priceCurrent = settledText === pricedText
  // A business invoice cannot be priced until its GSTIN is complete; say so instead of showing a refusal.
  const needsGstin = billType === 'b2b' && !!customerErrors.gstin
  const quantitiesOk = [...items, ...custom].every(i => Number(i.quantity) > 0)
  const discountOk = isAmount(discount) && Number(discount) <= 100
  // The server prices catalogue lines first, then the other lines in the order added.
  const preview = useQuery({
    queryKey: ['bill-preview', shop, settledText],
    queryFn: () => api.post<Preview>(`/v1/shops/${shop}/bills/preview`, JSON.parse(settledText) as CartInput),
    enabled: lineCount > 0 && quantitiesOk && discountOk && !needsGstin && !attempt, retry: false, placeholderData: keepPreviousData,
  })
  const pricing = lineCount > 0 && !attempt && !needsGstin && !preview.error && (!priceCurrent || preview.isFetching)
  const totals = lineCount > 0 && !needsGstin ? preview.data : undefined
  const locked = !!attempt || mutation.isPending
  // A cart the server refused (not enough stock, a whole-unit item): retrying cannot help.
  const cartProblem = !needsGstin && preview.error instanceof ApiError && preview.error.status === 422
  const customPreview = totals?.lines?.filter(l => l.product_uuid === null) ?? []

  const note = (text: string, kind: Status['kind'] = 'ok'): Status => ({ kind, text })
  function addProduct(product: Product): Status {
    setUnknown(null)
    const current = itemsNow.current
    const existing = current.some(i => i.product.uuid === product.uuid)
    if (!existing && current.length + custom.length >= MAX_LINES) return note(`An invoice can have ${MAX_LINES} lines. Create this invoice first.`, 'error')
    if (outOfStock(product)) return note(`${product.name} is out of stock, so it cannot be sold. Receive stock first.`, 'error')
    const next = addOrIncrement(current, product)
    commit(next.items)
    const warning = stockProblem(product, next.quantity)
    if (warning) return note(`${product.name} × ${formatQty(next.quantity)}. ${warning}`, 'warn')
    return note(next.added ? `Added ${product.name}` : `${product.name} × ${formatQty(next.quantity)}`)
  }
  const setQuantity = (index: number, quantity: string) => commit(items.map((row, n) => n === index ? { ...row, quantity } : row))
  // The payment options may only just have appeared (the first item), so look after this render.
  const goToPayment = () => { setTimeout(() => document.getElementById(PAY_FULL_ID)?.focus(), 0) }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (sending.current || (!attempt && (!totals || !priceCurrent || preview.isFetching || preview.error))) return
    let paidNow = '0'
    if (!attempt && (customerErrors.phone || customerErrors.gstin)) {
      setCheckCustomer(true)
      setCustomerOpen(true)
      // The panel opens on this render; focus once it is shown.
      setTimeout(() => document.querySelector<HTMLInputElement>(`input[name="${customerErrors.phone ? 'customer_phone' : 'customer_gstin'}"]`)?.focus())
      return
    }
    if (!attempt) {
      const total = totals!.total
      if (!payment.paid) { setPaidError('Choose how the customer paid: in full, part or not yet.'); goToPayment(); return }
      if (payment.paid === 'part' && (!isAmount(payment.amount) || Number(payment.amount) <= 0 || Number(payment.amount) >= Number(total))) return setPaidError(`Enter the amount paid now: more than ₹0 and less than ${formatMoney(total)}.`)
      paidNow = payment.paid === 'full' ? total : payment.paid === 'part' ? payment.amount : '0'
    }
    setPaidError('')
    sending.current = true
    const reference = payment.method === 'cash' ? null : payment.reference || null
    const next = attempt ?? { body: { ...cart, payment: { amount: paidNow, method: payment.method, reference: payment.paid === 'none' ? null : reference } }, key: crypto.randomUUID() }
    setAttempt(next)
    try {
      const result = await mutation.mutateAsync(next)
      clearDraft('bill', userId, shop)
      setDone(result)
    } catch (error) {
      // A rejected validation has rolled back. An unknown outcome keeps the key
      // and exact payload so a retry cannot charge or reduce stock twice.
      if (error instanceof ApiError && (error.status === 422 || (error.status === 409 && error.code !== 'idempotency_conflict'))) setAttempt(null)
    }
    finally { sending.current = false }
  }

  if (done) return <div className="checkout-page"><PageHeader eyebrow="SALES / INVOICES" title={SALES.newInvoice} actions={<Link className="button secondary" to="/billing">{SALES.invoices}</Link>} /><Completion detail={done} onAnother={another} /></div>

  const canSave = !mutation.isPending && (!!attempt || (!!totals && priceCurrent && !preview.isFetching && !preview.error && lineCount > 0))
  const unlinked = payment.paid && payment.paid !== 'full' && !customer.customer_phone.trim()
  const rows: [string, string][] = totals ? ([['Subtotal', totals.subtotal], ['Discount', totals.discount_amount], ['CGST', totals.cgst_amount], ['SGST', totals.sgst_amount], ['IGST', totals.igst_amount], ['Round-off', totals.round_off_amount]] as [string, string][]).filter(([k, v]) => k === 'Subtotal' || Number(v) !== 0) : []
  return <div className="checkout-page">
    <PageHeader eyebrow="SALES / INVOICES" title={SALES.newInvoice} actions={<Link className="button secondary" to="/billing">← Back to {SALES.invoices.toLowerCase()}</Link>} />
    {restored && <Alert kind="info">
      {attempt ? 'An invoice you were saving was not confirmed before this page closed. Retry saving to safely finish this same invoice; it will not be created twice.' : `Your unfinished invoice from ${new Date(restored.savedAt).toLocaleString()} was restored.`}
      {!attempt && <> <button type="button" className="link" onClick={discard}>Discard draft</button></>}
    </Alert>}
    <form className="checkout-grid" onSubmit={submit}>
      <fieldset className="checkout-main" disabled={locked}>
        <section className="card checkout-items" aria-label="Items">
          <ScanBox status={scanStatus} onStatus={setScanStatus} disabled={locked} onProduct={addProduct} onUnknown={setUnknown} onDone={goToPayment} />
          {unknown && <div className="unknown-code" role="alert">
            <p>No product has the barcode or code <code>{unknown}</code>.</p>
            <div className="actions">
              {canCreateProduct && <button type="button" onClick={() => setCreating(unknown)}>Create product with this barcode</button>}
              {canCustom && <button type="button" onClick={() => setAddingCustom(true)}>Add as item not in the list</button>}
              <button type="button" className="link" onClick={() => setUnknown(null)}>Dismiss</button>
            </div>
            {!canCreateProduct && !canCustom && <p className="muted">Ask the owner to add this product to the list.</p>}
          </div>}
          <div className="cart-head"><h2>Items{lineCount ? ` (${lineCount})` : ''}</h2>{canCustom && <button type="button" className="link" disabled={locked || lineCount >= MAX_LINES} onClick={() => setAddingCustom(true)}>+ Item not in the list</button>}</div>
          {!lineCount && <div className="cart-empty"><strong>Scan or search to start this invoice</strong><p>The first product you add appears here.</p></div>}
          {lineCount > 0 && <div className="table-wrap cart-table"><table className="table"><thead><tr><th>Item</th><th>Quantity</th><th className="num hide-sm">Price</th><th className="num">Amount</th><th><span className="sr-only">Remove</span></th></tr></thead><tbody>
            {items.map((i, index) => {
              const line = totals?.lines?.find(l => l.product_uuid === i.product.uuid)
              const problem = stockProblem(i.product, i.quantity)
              return <tr key={i.product.uuid}>
                <td className="cart-item"><span className="cart-name">{i.product.name}</span><small className="muted">{[i.product.barcode || i.product.product_code, i.product.gst_percent != null ? `GST ${formatQty(i.product.gst_percent)}%` : ''].filter(Boolean).join(' · ')}</small>{problem ? <small className="field-error" role="alert">{problem}</small> : stockText(i.product) && <small className="muted">{stockText(i.product)}</small>}</td>
                <td><input className="qty" aria-label={`Quantity for ${i.product.name}`} type="number" inputMode="decimal" min="0.001" max="1000000" step="0.001" required value={i.quantity} onChange={e => setQuantity(index, e.target.value)} />{i.product.unit_name && <small className="muted unit"> {i.product.unit_name}</small>}</td>
                <td className="num hide-sm">{line ? formatMoney(line.unit_price) : '—'}</td>
                <td className="num">{line ? formatMoney(line.amount) : '—'}</td>
                <td><button type="button" className="link remove" aria-label={`Remove ${i.product.name}`} onClick={() => commit(items.filter((_, n) => n !== index))}>✕</button></td></tr>
            })}
            {custom.map((c, index) => { const line = customPreview[index]; return <tr key={c.key}>
              <td className="cart-item"><span className="cart-name">{c.name}</span><small className="muted">Not in the list · GST {c.gst_percent}%</small></td>
              <td><input className="qty" aria-label={`Quantity for ${c.name}`} type="number" inputMode="decimal" min="0.001" max="1000000" step="0.001" required value={c.quantity} onChange={e => setCustom(custom.map((row, n) => n === index ? { ...row, quantity: e.target.value } : row))} /></td>
              <td className="num hide-sm">{line ? formatMoney(line.unit_price) : formatMoney(c.unit_price)}</td>
              <td className="num">{line ? formatMoney(line.amount) : '—'}</td>
              <td><button type="button" className="link remove" aria-label={`Remove ${c.name}`} onClick={() => setCustom(custom.filter((_, n) => n !== index))}>✕</button></td></tr> })}
          </tbody></table></div>}
          {cartProblem && <Alert>{describeError(preview.error)} Change the quantity or remove the item.</Alert>}
        </section>
      </fieldset>
      <aside className="checkout-summary" aria-label="Customer and payment">
        <fieldset className="bare" disabled={locked}>
          <CustomerPanel customer={customer} onChange={setCustomer} billType={billType} onBillType={setBillType} errors={shownErrors} open={customerOpen || !!(shownErrors.phone || shownErrors.gstin)} onOpen={setCustomerOpen} disabled={locked} />
        </fieldset>
        <section className="card checkout-totals" aria-label="Invoice total" aria-busy={pricing}>
          {!lineCount ? <p className="muted">Totals and payment appear once you add an item.</p> : <>
            {needsGstin && <Alert kind="info">A business invoice needs the customer's GSTIN before it can be priced. <button type="button" className="link" onClick={() => setCustomerOpen(true)}>Enter the GSTIN</button></Alert>}
            {preview.error && !cartProblem && !needsGstin && <Alert>{describeError(preview.error)} <button type="button" className="link" onClick={() => void preview.refetch()}>Retry pricing</button></Alert>}
            <dl className={`bill-totals${pricing ? ' pending' : ''}`}>
              {rows.map(([k, v]) => <div className="row" key={k}><dt>{k}</dt><dd>{formatMoney(v)}</dd></div>)}
              <div className="row grand-total"><dt>Total</dt><dd>{totals ? formatMoney(totals.total) : '—'}</dd></div>
            </dl>
            <p className="pricing-note muted" role="status">{pricing ? 'Updating total…' : ''}</p>
            <label className="discount">Discount (%)<input type="number" inputMode="decimal" min="0" max="100" step="0.01" required value={discount} disabled={locked} onChange={e => setDiscount(e.target.value)} /></label>
            {items.some(i => { const line = totals?.lines?.find(l => l.product_uuid === i.product.uuid); return line && i.product.mrp_price != null && Number(line.unit_price) > Number(i.product.mrp_price) }) && <Alert kind="info">A product’s selling price is above its MRP. Check the price before creating the invoice.</Alert>}
            <PaymentPanel total={totals?.total} value={payment} onChange={next => { setPayment(next); setPaidError('') }} error={paidError} disabled={locked} />
            {unlinked && <Alert kind="info">{customer.customer_name.trim() ? 'This customer has no phone number, so the unpaid amount will not appear under Customers.' : 'This is a walk-in sale, so the unpaid amount will not be tracked against anyone.'} <button type="button" className="link" onClick={() => setCustomerOpen(true)}>Add a customer with a phone number</button></Alert>}
          </>}
        </section>
        {mutation.error && <Alert>{describeError(mutation.error)} {attempt ? 'Your cart is locked. Retry to safely retrieve or create this same invoice.' : 'Check your cart and try again.'}</Alert>}
        <div className="actions checkout-submit"><button className="primary" disabled={!canSave}>{mutation.isPending ? 'Saving…' : attempt ? 'Retry saving invoice' : SALES.createInvoice}{!mutation.isPending && !attempt && totals && !pricing ? ` · ${formatMoney(totals.total)}` : ''}</button></div>
      </aside>
    </form>
    {addingCustom && <CustomItemEditor onClose={() => setAddingCustom(false)} onAdd={line => { setCustom([...custom, line]); setAddingCustom(false); setUnknown(null) }} />}
    {creating && <ProductForm startingBarcode={creating} onClose={() => setCreating(null)} onSaved={async () => {
      const code = creating
      setCreating(null)
      try { setScanStatus(addProduct(await api.get<Product>(`/v1/shops/${shop}/products/lookup?code=${encodeURIComponent(code)}`))) } catch { /* the new product can still be found by search */ }
    }} />}
  </div>
}
