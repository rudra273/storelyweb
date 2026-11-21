import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '../api/client'
import type { components } from '../api/schema'
import { useAuth } from '../auth/context'
import { useShop } from '../shops/context'
import { NavIcon } from '../components/layout/NavIcon'
import { Alert, Field, Loading } from '../components/ui/ui'
import { Button, PageHeader } from '../components/ui/workspace'
import { describeError } from '../components/useAction'
import { day } from '../components/labels'
import { useDebounced } from '../lib/useDebounced'
import { formatQty } from '../lib/money'
import { useProduct, useProducts, useSuppliers, type Product, type ProductPage } from '../products/queries'
import { SupplierEditor } from '../products/suppliers/Suppliers'
import { NewProductDraft } from './composer/NewProductDraft'
import { PurchaseImport } from './composer/PurchaseImport'
import { SupplierPicker } from './composer/SupplierPicker'
import { amountInCents, centsText, draftError, draftKey, newDraft, readDraft, subtotal, todayInShop, toInput, toPreview, validDate, type DraftLine, type PurchaseDraft } from './composer/draft'
import { receiptMoney } from './composer/money'
import { PURCHASE } from '../lib/vocabulary'
import type { Receipt } from './composer/contracts'
import { useConfirmReceipt } from './queries'
import './purchases.css'

const MAX_LINES = 200
const METHODS = [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['bank_transfer', 'Bank transfer'], ['online', 'Online']] as const
const PAYMENT_CHOICES = [
  ['not_recorded', 'Not recorded yet', 'Left out of what you owe until you record it.'],
  ['unpaid', 'Not paid yet', 'You owe the whole total.'],
  ['partial', 'Paid part now', 'You owe the rest.'],
  ['paid', 'Paid in full', 'Nothing is owed.'],
] as const

function productLine(product: Product): DraftLine {
  return { id: crypto.randomUUID(), product_uuid: product.uuid, name: product.name, unit: product.unit_name, quantity: '1', unit_cost: product.purchase_price ?? '', batch_no: '', expiry_date: '' }
}

/** Opens a purchase, filling in a product when sent here from Restock (`?product=`). A fresh visit starts from the saved draft. */
export function PurchaseWorkspacePage() {
  const [params] = useSearchParams()
  const location = useLocation()
  const productId = params.get('product') ?? ''
  const product = useProduct(productId || undefined)
  if (productId && product.isPending) return <Loading label="Opening purchase…" />
  return <PurchaseWorkspace key={location.key} initialProduct={product.data?.product} productMissing={!!productId && !product.data} initialSupplier={params.get('supplier') ?? ''} />
}

function PurchaseWorkspace({ initialProduct, productMissing, initialSupplier }: { initialProduct?: Product; productMissing: boolean; initialSupplier: string }) {
  const { user } = useAuth()
  const { current } = useShop()
  const navigate = useNavigate()
  const key = draftKey(user?.id ?? '', current?.shop_id ?? '')
  const [loaded] = useState(() => readDraft(key))
  const resumed = !initialProduct && !loaded.error && loaded.draft.items.length > 0
  const [draft, setDraft] = useState<PurchaseDraft>(() => {
    const fresh = !loaded.error && !loaded.draft.items.length && !loaded.draft.submitted
    let start = loaded.draft
    if (fresh && initialProduct?.track_stock) start = { ...start, items: [productLine(initialProduct)] }
    // Arriving from a supplier's page: the supplier is chosen, unless there is already a draft for someone else.
    if (initialSupplier && !loaded.error && !loaded.draft.submitted && !loaded.draft.supplier_uuid) start = { ...start, supplier_uuid: initialSupplier }
    return start
  })
  const draftRef = useRef(draft)
  const lastStored = useRef(loaded.serialized)
  const [storageError, setStorageError] = useState(loaded.error)
  const [conflict, setConflict] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateImport, setDuplicateImport] = useState(false)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [search, setSearch] = useState('')
  const query = useDebounced(search, 250)
  const [page, setPage] = useState(0)
  const [productEditor, setProductEditor] = useState<DraftLine | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const [addingSupplier, setAddingSupplier] = useState<string | null>(null)
  const suppliers = useSuppliers()
  const products = useProducts({ q: query, category: '', low: false, expiring: false, noCode: false, out: false, sort: 'name', dir: 'asc', page })
  const save = useConfirmReceipt()
  const sending = useRef(false)
  const focusLine = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const locked = busy || !!draft.submitted || conflict || !!loaded.error && !!storageError
  const shopId = current?.shop_id ?? ''

  function persist(next: PurchaseDraft): boolean {
    try {
      if (localStorage.getItem(key) !== lastStored.current) { setConflict(true); return false }
      const serialized = JSON.stringify(next)
      localStorage.setItem(key, serialized)
      lastStored.current = serialized
      setStorageError(null)
      return true
    }
    catch { setStorageError('Draft could not be saved on this browser. Enable browser storage and retry before confirming.'); return false }
  }
  function change(next: PurchaseDraft) {
    if (sending.current || draftRef.current.submitted || conflict) return
    draftRef.current = next
    setDraft(next)
    persist(next)
    setError(null)
  }
  function addProduct(product: Product) {
    const line = productLine(product)
    focusLine.current = line.id
    change({ ...draftRef.current, items: [...draftRef.current.items, line] })
    setSearch('')
  }
  // Enter (a scanner sends it after the code) adds the product when the text names exactly one, without waiting for the list below to refresh.
  async function addOnlyMatch(text: string) {
    const term = text.trim()
    if (!term || draftRef.current.items.length >= MAX_LINES) return
    try {
      const found = await api.get<ProductPage>(`/v1/shops/${shopId}/products?${new URLSearchParams({ q: term, limit: '5', sort: 'name', direction: 'asc' })}`)
      const tracked = found.items.filter(p => p.track_stock)
      if (tracked.length === 1) addProduct(tracked[0]!)
    } catch { /* the list below still shows the matches */ }
  }
  function updateLine(id: string, changes: Partial<DraftLine>) {
    change({ ...draftRef.current, items: draftRef.current.items.map(line => line.id === id ? { ...line, ...changes } : line) })
  }
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === key || event.key === null) setConflict(true) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (sending.current || storageError) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [storageError])

  async function confirm(event: FormEvent) {
    event.preventDefault()
    if (sending.current || conflict || storageError) return
    if (navigator.onLine === false) { setError('You are offline. This draft stays on this browser; reconnect to save the purchase.'); return }
    const active = draftRef.current
    if (!active.submitted) {
      const invalid = draftError(active)
      if (invalid) { setError(invalid); return }
    }
    const body = active.submitted ?? toInput(active)
    const attempted = { ...active, submitted: body }
    if (!persist(attempted)) return
    draftRef.current = attempted
    setDraft(attempted)
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await save.mutateAsync(body)
      setReceipt(result)
      try {
        if (localStorage.getItem(key) === lastStored.current) localStorage.removeItem(key)
        else setStorageError('Purchase saved. A newer draft from another tab was kept.')
      }
      catch { setStorageError('Purchase saved. The local draft could not be removed; reopening it will safely recover this same receipt.') }
    } catch (failure) {
      setError(describeError(failure))
      setDuplicateImport(failure instanceof ApiError && failure.code === 'duplicate_purchase_import')
      // Only definitive rejections permit editing. Network/server failures and
      // key conflicts must keep the frozen request for safe resolution.
      if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500 && failure.code !== 'request_conflict' && failure.status !== 408 && (!active.submitted || failure.status === 422 || ['duplicate_invoice', 'duplicate_purchase_import'].includes(failure.code))) {
        const editable = { ...active, submitted: null }
        draftRef.current = editable
        setDraft(editable)
        persist(editable)
      }
    } finally { sending.current = false; setBusy(false) }
  }
  function discard() {
    if (sending.current || draftRef.current.submitted || conflict) return
    if (!window.confirm('Discard this local purchase draft? If it could not be read, check purchase history first to avoid recording the same purchase twice.')) return
    try {
      localStorage.removeItem(key)
      lastStored.current = null
      const fresh = newDraft()
      draftRef.current = fresh; setDraft(fresh); setStorageError(null); setError(null); setDuplicateImport(false)
    } catch { setStorageError('The local draft could not be removed. Enable browser storage and try again.') }
  }

  const total = subtotal(draft)
  // The server works out the final total (tax, charges, discount) with the same code that saves it.
  const previewBody = !draft.submitted && !receipt && draftError(draft) === null ? JSON.stringify(toPreview(draft)) : null
  const settledPreview = useDebounced(previewBody, 250)
  const review = useQuery({
    queryKey: ['purchase-preview', shopId, settledPreview],
    queryFn: () => api.post<components['schemas']['ReceiptPreview']>(`/v1/shops/${shopId}/purchase-receipts/preview`, JSON.parse(settledPreview!)),
    enabled: !!settledPreview && !!shopId, retry: false,
  })
  const reviewCurrent = !!review.data && !review.isFetching && settledPreview === previewBody && !review.error
  // The same supplier invoice number in the same financial year is refused by the server; say so before saving.
  const invoice = useDebounced(draft.invoice_number.trim(), 400)
  const checkable = !draft.submitted && !receipt && !!draft.supplier_uuid && !!invoice && validDate(draft.purchase_date)
  const invoiceCheck = useQuery({
    queryKey: ['invoice-check', shopId, draft.supplier_uuid, invoice.toLowerCase(), draft.purchase_date],
    queryFn: () => api.get<components['schemas']['InvoiceCheck']>(`/v1/shops/${shopId}/purchase-receipts/invoice-check?${new URLSearchParams({ supplier: draft.supplier_uuid, invoice_number: invoice, purchase_date: draft.purchase_date })}`),
    enabled: checkable && !!shopId && invoice === draft.invoice_number.trim(), retry: false,
  })
  const alreadyRecorded = checkable && invoice === draft.invoice_number.trim() ? invoiceCheck.data?.existing ?? null : null
  const choice = draft.payment_choice ?? (draft.record_payment_terms ? 'unpaid' : 'not_recorded')
  const recording = choice !== 'not_recorded'
  const leave = (event: React.MouseEvent) => {
    if (!receipt && storageError && !window.confirm('The draft could not be saved on this browser. Leave anyway? Unsaved changes may be lost.')) event.preventDefault()
  }

  if (receipt) {
    return <div className="purchase-workspace">
      <PageHeader eyebrow="PURCHASES" title="Purchase saved" description="The stock has been added." />
      <Alert kind="success">Stock added to {receipt.items.length} product{receipt.items.length === 1 ? '' : 's'}. This purchase is saved.</Alert>
      {storageError && <Alert>{storageError}</Alert>}
      <section className="card pw-card" aria-label="Saved purchase">
        <dl className="facts">
          <dt>Supplier</dt><dd>{receipt.supplier_name ?? 'No supplier'}</dd>
          <dt>Received</dt><dd>{day(receipt.purchase_date)}</dd>
          {receipt.invoice_number && <><dt>Supplier invoice</dt><dd>{receipt.invoice_number}</dd></>}
          <dt>Total</dt><dd>{receipt.total == null ? `${receiptMoney(receipt.subtotal)} stock cost` : receiptMoney(receipt.total)}</dd>
          <dt>Balance due</dt><dd>{receipt.balance_due == null ? 'Not recorded' : receiptMoney(receipt.balance_due)}</dd>
        </dl>
        <div className="actions">
          <Link className="button primary" to={`/purchases/${receipt.uuid}`}>View purchase</Link>
          <Button onClick={() => navigate('/purchases/new', { replace: true })}>Record another purchase</Button>
          <Link className="button secondary" to="/purchases">Back to purchases</Link>
        </div>
      </section>
    </div>
  }

  return <div className="purchase-workspace">
    <p className="crumbs"><Link to="/purchases" onClick={leave}>← Purchase invoices</Link></p>
    <PageHeader eyebrow="PURCHASES" title="Record purchase" description="Stock you have received from a supplier. Your draft is kept on this browser, so you can leave and come back." />
    {productMissing && <Alert kind="info">That product could not be opened, so nothing was filled in. Search for it below.</Alert>}
    {resumed && draft.items.length > 0 && !draft.submitted && <Alert kind="info">Continuing your saved draft ({draft.items.length} item{draft.items.length === 1 ? '' : 's'}). <button type="button" className="link" onClick={discard}>Start over</button></Alert>}
    {conflict && <Alert>This draft changed in another tab. Reload this page to load the latest version.</Alert>}
    {storageError && <Alert>{storageError} {!loaded.error && <Button onClick={() => persist(draftRef.current)}>Retry saving draft</Button>}</Alert>}
    {duplicateImport && !draft.submitted && draft.items.some(line => line.import_key) && <label className="check"><input type="checkbox" checked={!!draft.allow_duplicate_import_keys?.length} onChange={e => change({ ...draftRef.current, allow_duplicate_import_keys: e.target.checked ? [...new Set(draft.items.flatMap(line => line.import_key ? [line.import_key] : []))] : [] })} />I reviewed the file history and intend to import these quantities again</label>}
    {draft.submitted && <Alert kind="info">The save needs confirmation. Retry the same purchase to recover its result before making changes.</Alert>}
    <form onSubmit={confirm} noValidate aria-busy={busy} className="pw-grid">
      <div className="pw-main">
        <fieldset disabled={locked} className="pw-fieldset">
          <section className="card pw-card" aria-labelledby="pw-supplier">
            <h2 id="pw-supplier">Supplier and invoice</h2>
            <div className="pw-fields">
              <Field label="Receipt date" type="date" required max={todayInShop()} value={draft.purchase_date} onChange={e => change({ ...draft, purchase_date: e.target.value })} />
              <SupplierPicker suppliers={suppliers.data} value={draft.supplier_uuid} loading={suppliers.isPending} onChange={uuid => change({ ...draft, supplier_uuid: uuid })} onCreate={name => setAddingSupplier(name)} />
              <Field label="Supplier invoice number" maxLength={100} hint="The number on the supplier's own bill, not a Storely invoice." value={draft.invoice_number} onChange={e => change({ ...draft, invoice_number: e.target.value })} />
              <Field label="Notes" maxLength={500} value={draft.notes} onChange={e => change({ ...draft, notes: e.target.value })} />
            </div>
            {suppliers.error && <Alert>Suppliers could not be loaded. <button type="button" className="link" onClick={() => void suppliers.refetch()}>Retry suppliers</button></Alert>}
            {alreadyRecorded && <Alert>This supplier invoice is already recorded: {day(alreadyRecorded.purchase_date)}, {alreadyRecorded.total == null ? `${receiptMoney(alreadyRecorded.subtotal)} stock cost` : receiptMoney(alreadyRecorded.total)}. <Link to={`/purchases/${alreadyRecorded.uuid}`}>View it</Link>. Saving the same invoice twice is not allowed; check the number or the date.</Alert>}
          </section>

          <section className="card pw-card" aria-labelledby="pw-items">
            <h2 id="pw-items">Items received ({draft.items.length})</h2>
            <div className="purchase-picker" role="group" aria-label="Select purchase products">
              <Field label="Find product" type="search" placeholder="Search name, code or barcode" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addOnlyMatch(search) } }} />
              {products.isPending && <Loading label="Loading products…" />}
              {products.error && <Alert>Products could not be loaded. <button type="button" className="link" onClick={() => void products.refetch()}>Retry products</button></Alert>}
              <ul className="plain purchase-results">{products.data?.items.filter(p => p.track_stock).map(p => <li className="row" key={p.uuid}><span>{p.name}<small className="muted"> · {formatQty(p.quantity)} {p.unit_name} in stock · last cost {p.purchase_price == null ? '—' : receiptMoney(p.purchase_price)}</small></span><Button aria-label={`Add ${p.name}`} disabled={draft.items.length >= MAX_LINES} onClick={() => addProduct(p)}>Add</Button></li>)}</ul>
              {products.data && !products.data.items.some(p => p.track_stock) && <p className="muted">No stock-tracked products on this page. Try another search or page.</p>}
              <div className="actions"><Button disabled={page === 0 || products.isFetching} onClick={() => setPage(page - 1)}>Previous products</Button><Button disabled={!products.data?.next_cursor || products.isFetching} onClick={() => setPage(page + 1)}>More products</Button>
                <Button disabled={draft.items.length >= MAX_LINES} onClick={() => setProductEditor('new')}>New product</Button><Button disabled={draft.items.length >= MAX_LINES} onClick={() => setImporting(true)}>Import purchase file</Button></div>
            </div>
            {!draft.items.length && <p className="muted">Select a product above to start. Add the same product again for a different batch or cost.</p>}
            {draft.items.length > 0 && <div className="table-wrap"><table className="table pw-lines">
              <thead><tr><th>Product</th><th className="num">Quantity</th><th className="num">Unit cost (₹)</th><th className="num">Amount</th><th>Batch</th><th>Expiry</th></tr></thead>
              <tbody>{draft.items.map((line, index) => {
                const amount = amountInCents(line.quantity, line.unit_cost)
                const n = index + 1
                return <tr key={line.id} ref={node => {
                  if (node && focusLine.current === line.id) { focusLine.current = null; node.querySelector('input')?.focus({ preventScroll: true }); node.scrollIntoView?.({ block: 'center' }) }
                }}>
                  <td className="pw-product" data-label="Product"><div className="pw-product-head"><span><strong>{n}. {line.name}</strong>{line.new_product && <span className="badge">New</span>}{line.unit && <small className="muted"> ({line.unit})</small>}</span><button type="button" className="ui-button icon-button" aria-label={`Remove item ${n}`} onClick={() => change({ ...draft, items: draft.items.filter(item => item.id !== line.id) })}><NavIcon name="close" className="icon" /></button></div>
                    {line.new_product && <div className="pw-row-actions"><button type="button" className="link" onClick={() => setProductEditor(line)} aria-label={`Edit new product ${n}`}>Edit</button><button type="button" className="link" disabled={draft.items.length >= MAX_LINES} onClick={() => change({ ...draftRef.current, items: [...draftRef.current.items, { ...line, id: crypto.randomUUID(), batch_no: '', expiry_date: '' }] })} aria-label={`Add another lot of ${line.name}`}>Add another lot</button></div>}
                  </td>
                  <td className="num" data-label="Quantity"><input aria-label={`Quantity · item ${n}`} inputMode="decimal" value={line.quantity} onChange={e => updateLine(line.id, { quantity: e.target.value })} /></td>
                  <td className="num" data-label="Unit cost (₹)"><input aria-label={`Unit cost (₹) · item ${n}`} inputMode="decimal" value={line.unit_cost} onChange={e => updateLine(line.id, { unit_cost: e.target.value })} /></td>
                  <td className="num pw-amount" data-label="Amount">{amount === null ? '—' : receiptMoney(centsText(amount))}</td>
                  <td data-label="Batch"><input aria-label={`Batch · item ${n}`} maxLength={100} value={line.batch_no} onChange={e => updateLine(line.id, { batch_no: e.target.value })} /></td>
                  <td data-label="Expiry"><input aria-label={`Expiry · item ${n}`} type="date" value={line.expiry_date} onChange={e => updateLine(line.id, { expiry_date: e.target.value })} /></td>
                </tr>
              })}</tbody>
            </table></div>}
          </section>

          <section className="card pw-card" aria-labelledby="pw-charges">
            <h2 id="pw-charges">Tax, charges and discount</h2>
            <p className="muted">From the supplier's bill. {PURCHASE.costRule}</p>
            <div className="pw-fields">
              {(['tax_amount', 'charges_amount', 'discount_amount'] as const).map(field => <Field key={field} label={{ tax_amount: 'GST amount (₹)', charges_amount: 'Other charges (₹)', discount_amount: 'Discount (₹)' }[field]} inputMode="decimal" value={draft[field] ?? ''} onChange={e => change({ ...draftRef.current, [field]: e.target.value })} />)}
            </div>
          </section>

          <section className="card pw-card" aria-labelledby="pw-payment">
            <h2 id="pw-payment">Payment to the supplier</h2>
            <div className="pw-choices" role="radiogroup" aria-label="Payment">
              {PAYMENT_CHOICES.map(([value, label, note]) => <label key={value} className={`pw-choice${choice === value ? ' on' : ''}`}>
                <input type="radio" name="payment-choice" value={value} checked={choice === value} onChange={() => change({ ...draftRef.current, payment_choice: value, record_payment_terms: value !== 'not_recorded' })} />
                <span><strong>{label}</strong><small className="muted">{note}</small></span>
              </label>)}
            </div>
            {recording && !draft.supplier_uuid && <Alert kind="info">Choose a supplier above to record what you owe.</Alert>}
            <div className="pw-fields">
              {choice === 'partial' && <Field label="Paid now (₹)" inputMode="decimal" value={draft.paid_now ?? ''} onChange={e => change({ ...draftRef.current, paid_now: e.target.value })} />}
              {(choice === 'paid' || choice === 'partial') && <div className="field"><label htmlFor="pw-method">Payment method</label><select id="pw-method" value={draft.payment_method ?? 'cash'} onChange={e => change({ ...draftRef.current, payment_method: e.target.value as PurchaseDraft['payment_method'] })}>{METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
              {(choice === 'unpaid' || choice === 'partial') && <Field label="Due date (optional)" type="date" min={draft.purchase_date} value={draft.due_date ?? ''} onChange={e => change({ ...draftRef.current, due_date: e.target.value })} />}
            </div>
          </section>
        </fieldset>
      </div>

      <aside className="pw-side" aria-label="Review">
        <section className="card pw-review" aria-live="polite">
          <h2>Review</h2>
          {draft.submitted ? <p className="muted">The total was fixed when you pressed Save purchase.</p>
            : !draft.items.length ? <p className="muted">Add a product to see the total.</p>
            : review.error ? <Alert>{describeError(review.error)}</Alert>
            : !reviewCurrent ? <p className="muted">{previewBody === null ? (total === null ? 'Complete quantities and costs to see the total.' : 'Fix the highlighted details to see the total.') : 'Calculating the total…'}</p>
            : <dl className="pw-totals">
              <dt>{PURCHASE.items}</dt><dd>{receiptMoney(review.data!.subtotal)}</dd>
              {Number(review.data!.tax_amount) > 0 && <><dt>{PURCHASE.gst}</dt><dd>{receiptMoney(review.data!.tax_amount)}</dd></>}
              {Number(review.data!.charges_amount) > 0 && <><dt>{PURCHASE.charges}</dt><dd>{receiptMoney(review.data!.charges_amount)}</dd></>}
              {Number(review.data!.discount_amount) > 0 && <><dt>{PURCHASE.discount}</dt><dd>−{receiptMoney(review.data!.discount_amount)}</dd></>}
              <dt className="pw-grand">{PURCHASE.total}</dt><dd className="pw-grand"><strong>{receiptMoney(review.data!.total)}</strong></dd>
              {review.data!.payment_recorded ? <><dt>Paid now</dt><dd>{receiptMoney(review.data!.paid_now)}</dd><dt className="pw-grand">{PURCHASE.balance}</dt><dd className="pw-grand"><strong>{receiptMoney(review.data!.balance_due)}</strong></dd></>
                : <><dt className="pw-unresolved">Payment</dt><dd className="pw-unresolved">Not recorded</dd></>}
            </dl>}
          {reviewCurrent && !draft.submitted && (Number(review.data!.tax_amount) > 0 || Number(review.data!.charges_amount) > 0 || Number(review.data!.discount_amount) > 0) && <p className="muted pw-note">{PURCHASE.costRule}</p>}
          {reviewCurrent && !draft.submitted && !review.data!.payment_recorded && <p className="muted pw-note">Left out of supplier dues until payment is recorded. Choose an option under Payment to the supplier.</p>}
          {error && <Alert>{error}</Alert>}
          <div className="pw-actions">
            <Button type="submit" variant="primary" disabled={busy || conflict || !!storageError || !draft.items.length || !!alreadyRecorded || (!draft.submitted && previewBody !== null && !reviewCurrent && navigator.onLine !== false)}>{busy ? 'Saving purchase…' : draft.submitted ? 'Retry purchase' : 'Save purchase'}</Button>
            <Button disabled={busy || !!draft.submitted || conflict} onClick={discard}>Discard draft</Button>
          </div>
        </section>
      </aside>
    </form>
    {productEditor && <NewProductDraft line={productEditor === 'new' ? undefined : productEditor} onClose={() => setProductEditor(null)} onStage={line => {
      const active = draftRef.current
      const items = productEditor === 'new' ? [...active.items, line] : active.items.map(item => item.id === line.id ? line : item.new_product?.client_key === line.new_product?.client_key ? { ...item, new_product: line.new_product, name: line.name, unit: line.unit } : item)
      if (items.length <= MAX_LINES) { change({ ...active, items }); focusLine.current = line.id; setProductEditor(null) }
    }} />}
    {importing && <PurchaseImport existingKeys={draft.items.flatMap(line => line.import_key ? [line.import_key] : [])} available={MAX_LINES - draft.items.length} onClose={() => setImporting(false)} onStage={(lines, allowDuplicate) => {
      const active = draftRef.current
      if (active.items.length + lines.length <= MAX_LINES) { change({ ...active, items: [...active.items, ...lines], allow_duplicate_import_keys: [...new Set([...(active.allow_duplicate_import_keys ?? []), ...lines.flatMap(line => allowDuplicate && line.import_key ? [line.import_key] : [])])] }); setImporting(false) }
    }} />}
    {addingSupplier !== null && <SupplierEditor initialName={addingSupplier} onClose={() => setAddingSupplier(null)} onSaved={supplier => { change({ ...draftRef.current, supplier_uuid: supplier.uuid }); setAddingSupplier(null) }} />}
  </div>
}
