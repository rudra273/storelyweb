import { NewProductDraft } from './NewProductDraft'
import { PurchaseImport } from './PurchaseImport'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/context'
import { useShop } from '../shops/context'
import { Modal } from '../components/Modal'
import { Alert, Field, Loading } from '../components/ui'
import { Button } from '../components/workspace'
import { describeError } from '../components/useAction'
import { useDebounced } from '../lib/useDebounced'
import { formatQty } from '../lib/money'
import { useProducts, useSuppliers, type Product } from '../products/queries'
import { SupplierEditor } from '../products/Suppliers'
import { amountInCents, centsText, draftError, draftKey, newDraft, readDraft, subtotal, todayInShop, toInput, type DraftLine, type PurchaseDraft } from './draft'
import { useConfirmReceipt } from './queries'
import { receiptMoney } from './money'
import { PurchaseSummary } from './PurchaseDetail'
import type { Receipt } from './contracts'
import './purchases.css'

function productLine(product: Product): DraftLine {
  return { id: crypto.randomUUID(), product_uuid: product.uuid, name: product.name, unit: product.unit_name, quantity: '1', unit_cost: product.purchase_price ?? '', batch_no: '', expiry_date: '' }
}
export function PurchaseComposer({ onClose, initialProduct }: { onClose: () => void; initialProduct?: Product }) {
  const { user } = useAuth()
  const { current } = useShop()
  const key = draftKey(user?.id ?? '', current?.shop_id ?? '')
  const [loaded] = useState(() => readDraft(key))
  const [draft, setDraft] = useState<PurchaseDraft>(() => initialProduct && !loaded.error && !loaded.draft.items.length && !loaded.draft.submitted ? { ...loaded.draft, items: [productLine(initialProduct)] } : loaded.draft)
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
  const [addingSupplier, setAddingSupplier] = useState(false)
  const suppliers = useSuppliers()
  const products = useProducts({ q: query, category: '', low: false, expiring: false, sort: 'name', dir: 'asc', page })
  const save = useConfirmReceipt()
  const sending = useRef(false)
  const focusLine = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const locked = busy || !!draft.submitted || conflict || !!loaded.error && !!storageError

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
  const close = () => {
    if (sending.current) return
    if (!receipt && storageError && !window.confirm('The draft could not be saved on this browser. Close anyway? Unsaved changes may be lost.')) return
    if (!receipt && !conflict && !storageError && !persist(draftRef.current)) return
    onClose()
  }
  return <Modal title={receipt ? 'Purchase saved' : 'Add purchase'} onClose={close} canClose={!busy} wide>
    {receipt ? <><Alert kind="success">Stock added. This purchase is saved.</Alert><PurchaseSummary receipt={receipt} />{storageError && <Alert>{storageError}</Alert>}<Button variant="primary" onClick={close}>Done</Button></> : <>
      <p className="muted">Record stock you have received. Drafts stay on this browser for this account and shop.</p>
      {conflict && <Alert>This draft changed in another tab. Close and reopen it to load the latest version.</Alert>}
      {storageError && <Alert>{storageError} {!loaded.error && <Button onClick={() => persist(draftRef.current)}>Retry saving draft</Button>}</Alert>}
      {duplicateImport && !draft.submitted && draft.items.some(line => line.import_key) && <label className="check"><input type="checkbox" checked={!!draft.allow_duplicate_import_keys?.length} onChange={e => change({ ...draftRef.current, allow_duplicate_import_keys: e.target.checked ? [...new Set(draft.items.flatMap(line => line.import_key ? [line.import_key] : []))] : [] })} />I reviewed the file history and intend to import these quantities again</label>}
      {draft.submitted && <Alert kind="info">The save needs confirmation. Retry the same purchase to recover its result before making changes.</Alert>}
      <form onSubmit={confirm} noValidate aria-busy={busy}>
        <fieldset disabled={locked}>
          <div className="purchase-header">
            <Field label="Receipt date" type="date" required max={todayInShop()} value={draft.purchase_date} onChange={e => change({ ...draft, purchase_date: e.target.value })} />
            <div className="field"><label htmlFor="purchase-supplier">Supplier (optional)</label><select id="purchase-supplier" disabled={suppliers.isPending || suppliers.isError} value={draft.supplier_uuid} onChange={e => change({ ...draft, supplier_uuid: e.target.value })}><option value="">No supplier</option>{draft.supplier_uuid && !suppliers.data?.some(s => s.uuid === draft.supplier_uuid) && <option value={draft.supplier_uuid}>Saved supplier</option>}{suppliers.data?.map(s => <option key={s.uuid} value={s.uuid}>{s.name}</option>)}</select><Button onClick={() => setAddingSupplier(true)}>Add supplier</Button></div>
          </div>
          {suppliers.error && <Alert>Suppliers could not be loaded. <button type="button" className="link" onClick={() => void suppliers.refetch()}>Retry suppliers</button></Alert>}
          <details><summary>Invoice reference and notes (optional)</summary><Field label="Supplier invoice number" maxLength={100} value={draft.invoice_number} onChange={e => change({ ...draft, invoice_number: e.target.value })} /><Field label="Purchase notes" maxLength={500} value={draft.notes} onChange={e => change({ ...draft, notes: e.target.value })} /></details>
          <section aria-label="Select purchase products" className="purchase-picker">
            <Field label="Find product" type="search" placeholder="Search name, code or barcode" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
            {products.isPending && <Loading label="Loading products…" />}
            {products.error && <Alert>Products could not be loaded. <button type="button" className="link" onClick={() => void products.refetch()}>Retry products</button></Alert>}
            <ul className="plain purchase-results">{products.data?.items.filter(p => p.track_stock).map(p => <li className="row" key={p.uuid}><span>{p.name}<small className="muted"> · {formatQty(p.quantity)} {p.unit_name} in stock · last cost {p.purchase_price == null ? '—' : receiptMoney(p.purchase_price)}</small></span><Button aria-label={`Add ${p.name}`} disabled={draft.items.length >= 200} onClick={() => addProduct(p)}>Add</Button></li>)}</ul>
            {products.data && !products.data.items.some(p => p.track_stock) && <p className="muted">No stock-tracked products on this page. Try another search or page.</p>}
            <div className="actions"><Button disabled={page === 0 || products.isFetching} onClick={() => setPage(page - 1)}>Previous products</Button><Button disabled={!products.data?.next_cursor || products.isFetching} onClick={() => setPage(page + 1)}>More products</Button></div>
          </section>
          <div className="actions"><Button disabled={draft.items.length >= 200} onClick={() => setProductEditor('new')}>New product</Button><Button disabled={draft.items.length >= 200} onClick={() => setImporting(true)}>Import purchase file</Button></div>
          <h3>Purchase items ({draft.items.length})</h3>
          {!draft.items.length && <p className="muted">Select a product above to start. Add the same product again for a different batch or cost.</p>}
          <ol className="plain purchase-lines">{draft.items.map((line, index) => {
            const amount = amountInCents(line.quantity, line.unit_cost)
            return <li key={line.id} className="purchase-line" ref={node => {
              if (node && focusLine.current === line.id) { focusLine.current = null; node.querySelector('input')?.focus({ preventScroll: true }); node.scrollIntoView?.({ block: 'center' }) }
            }}><div className="row"><strong>{index + 1}. {line.name}{line.new_product && <span className="badge">New</span>}{line.unit && ` (${line.unit})`}</strong><Button onClick={() => change({ ...draft, items: draft.items.filter(item => item.id !== line.id) })}>Remove item {index + 1}</Button></div>
              {line.new_product && <div className="actions"><Button onClick={() => setProductEditor(line)}>Edit new product {index + 1}</Button><Button disabled={draft.items.length >= 200} onClick={() => change({ ...draftRef.current, items: [...draftRef.current.items, { ...line, id: crypto.randomUUID(), batch_no: '', expiry_date: '' }] })}>Add another lot of {line.name}</Button></div>}
              <div className="purchase-line-fields"><Field label={`Quantity · item ${index + 1}`} inputMode="decimal" value={line.quantity} onChange={e => updateLine(line.id, { quantity: e.target.value })} /><Field label={`Unit cost (₹) · item ${index + 1}`} inputMode="decimal" value={line.unit_cost} onChange={e => updateLine(line.id, { unit_cost: e.target.value })} /><p>Amount: <strong>{amount === null ? '—' : receiptMoney(centsText(amount))}</strong></p></div>
              <details><summary>Batch and expiry (optional)</summary><div className="purchase-line-fields"><Field label={`Batch · item ${index + 1}`} maxLength={100} value={line.batch_no} onChange={e => updateLine(line.id, { batch_no: e.target.value })} /><Field label={`Expiry · item ${index + 1}`} type="date" value={line.expiry_date} onChange={e => updateLine(line.id, { expiry_date: e.target.value })} /></div></details>
            </li>
          })}</ol>
        </fieldset>
        <fieldset disabled={locked}>
          <details><summary>Charges, tax and payment terms</summary>
            {(['tax_amount', 'charges_amount', 'discount_amount'] as const).map(field => <Field key={field} label={{ tax_amount: 'GST amount (₹)', charges_amount: 'Other charges (₹)', discount_amount: 'Discount (₹)' }[field]} inputMode="decimal" value={draft[field] ?? ''} onChange={e => change({ ...draftRef.current, [field]: e.target.value })} />)}
            <label>Payment<select aria-label="Payment" value={draft.payment_choice ?? (draft.record_payment_terms ? 'unpaid' : 'not_recorded')} onChange={e => change({ ...draftRef.current, payment_choice: e.target.value as PurchaseDraft['payment_choice'], record_payment_terms: e.target.value !== 'not_recorded' })}><option value="not_recorded">Not recorded</option><option value="unpaid">Unpaid</option><option value="partial">Part paid</option><option value="paid">Paid in full</option></select></label>
            {draft.payment_choice === 'partial' && <Field label="Paid now (₹)" inputMode="decimal" value={draft.paid_now ?? ''} onChange={e => change({ ...draftRef.current, paid_now: e.target.value })} />}
            {(draft.payment_choice === 'paid' || draft.payment_choice === 'partial') && <label>Payment method<select aria-label="Payment method" value={draft.payment_method ?? 'cash'} onChange={e => change({ ...draftRef.current, payment_method: e.target.value as PurchaseDraft['payment_method'] })}>{(['cash', 'upi', 'card', 'bank_transfer', 'online'] as const).map(method => <option key={method} value={method}>{({ cash: 'Cash', upi: 'UPI', card: 'Card', bank_transfer: 'Bank transfer', online: 'Online' })[method]}</option>)}</select></label>}
            <p className="muted">Choose a supplier when recording payment terms. Paid in full uses the final total calculated by the server.</p>
            {draft.record_payment_terms && <Field label="Due date (optional)" type="date" min={draft.purchase_date} value={draft.due_date ?? ''} onChange={e => change({ ...draftRef.current, due_date: e.target.value })} />}
          </details>
        </fieldset>
        <div className="purchase-footer">{error && <Alert>{error}</Alert>}<div className="purchase-footer-row"><p>Stock cost subtotal: <strong>{total === null ? 'Complete quantities and costs' : receiptMoney(total)}</strong><br /><small className="muted">The saved receipt shows the final total including entered tax, charges and discount.</small></p><div className="actions"><Button disabled={busy} onClick={close}>Close and keep draft</Button><Button disabled={busy || !!draft.submitted || conflict} onClick={discard}>Discard draft</Button><Button type="submit" variant="primary" disabled={busy || conflict || !!storageError || !draft.items.length}>{busy ? 'Saving purchase…' : draft.submitted ? 'Retry purchase' : 'Save purchase'}</Button></div></div></div>
      </form>
      {productEditor && <NewProductDraft line={productEditor === 'new' ? undefined : productEditor} onClose={() => setProductEditor(null)} onStage={line => {
        const active = draftRef.current
        const items = productEditor === 'new' ? [...active.items, line] : active.items.map(item => item.id === line.id ? line : item.new_product?.client_key === line.new_product?.client_key ? { ...item, new_product: line.new_product, name: line.name, unit: line.unit } : item)
        if (items.length <= 200) { change({ ...active, items }); focusLine.current = line.id; setProductEditor(null) }
      }} />}
      {importing && <PurchaseImport existingKeys={draft.items.flatMap(line => line.import_key ? [line.import_key] : [])} available={200 - draft.items.length} onClose={() => setImporting(false)} onStage={(lines, allowDuplicate) => {
        const active = draftRef.current
        if (active.items.length + lines.length <= 200) { change({ ...active, items: [...active.items, ...lines], allow_duplicate_import_keys: [...new Set([...(active.allow_duplicate_import_keys ?? []), ...lines.flatMap(line => allowDuplicate && line.import_key ? [line.import_key] : [])])] }); setImporting(false) }
      }} />}
      {addingSupplier && <SupplierEditor onClose={() => setAddingSupplier(false)} onSaved={supplier => { change({ ...draftRef.current, supplier_uuid: supplier.uuid }); setAddingSupplier(false) }} />}
    </>}
  </Modal>
}
