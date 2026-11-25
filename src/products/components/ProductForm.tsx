import { SupplierEditor } from '../suppliers/Suppliers'
import { CategoryEditor, UnitEditor } from './QuickCreate'
import { PriceBreakdown } from './PriceBreakdown'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, FormSection } from '../../components/ui/workspace'
import { Modal } from '../../components/ui/Modal'
import { Alert, Field } from '../../components/ui/ui'
import { useAction } from '../../components/useAction'
import { decimalOrNull, isAmount } from '../../lib/money'
import { useDebounced } from '../../lib/useDebounced'
import { useRetryKey } from '../../lib/retryKey'
import { useAuth } from '../../auth/context'
import { useShop } from '../../shops/context'
import { clearDraft, loadDraft, saveDraft } from '../../lib/drafts'
import { GST_RATES, saveProduct, useCategories, usePricePreview, useProductMutation, useUnits, useSuppliers, type PriceInput, type Product } from '../queries'
import { api, ApiError } from '../../api/client'
import { assertProductEditSupport, changedFields, rebaseEditedFields } from '../editGuard'
import { ProductConflictReview } from './ProductConflictReview'
import { useDirtyClose } from '../../lib/dirty'

/** Add a product (no `product`) or edit one. Stock is never typed in on edit: it is changed
 * with "Adjust stock", so the history always explains the number. */
export function ProductForm({ product, startingBarcode, onClose, onSaved }: { product?: Product; startingBarcode?: string; onClose: () => void; onSaved: (id: string, savedProduct: Product) => void | Promise<void> }) {
  const sending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const close = () => { if (!sending.current) onClose() }
  const editing = !!product
  // A form opened for one scanned code is its own small task: it neither restores nor overwrites the saved new-product draft.
  const keepsDraft = !editing && !startingBarcode
  const save = useProductMutation(saveProduct)
  const retryKey = useRetryKey()
  const categories = useCategories()
  const units = useUnits()
  const suppliers = useSuppliers()
  const [addingSupplier, setAddingSupplier] = useState(false)
  const [adding, setAdding] = useState<'category' | 'unit' | null>(null)
  const { busy: saving, error, run, setError, fieldErrors, setFieldErrors } = useAction()
  const [delivering, setDelivering] = useState(false)
  const busy = saving || delivering
  const formRef = useRef<HTMLFormElement>(null)
  const [invalid, setInvalid] = useState<Record<string, string>>({})
  const errors = { ...fieldErrors, ...invalid }
  const [focusTick, setFocusTick] = useState(0)
  // After a failed save, take the shop owner straight to the first field that needs fixing.
  useEffect(() => { if (focusTick) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus() }, [focusTick])
  const [baseline, setBaseline] = useState(product)
  const [stale, setStale] = useState(false)
  const [latest, setLatest] = useState<Product | null>(null)
  const fields = (value?: Product) => ({
    name: value?.name ?? '',
    supplier: value?.supplier_uuid ?? '',
    code: value?.product_code ?? '',
    barcode: value?.barcode ?? startingBarcode ?? '',
    category: value?.category_uuid ?? '',
    unit: value?.unit_uuid ?? '',
    hsn: value?.hsn_code ?? '',
    gst: value?.gst_percent ?? '',
    selling: value?.selling_price ?? '',
    mrp: value?.mrp_price ?? '',
    purchase: value?.purchase_price ?? '',
    reorder: value?.reorder_level ?? '',
    track: value?.track_stock ?? true,
    opening: '',
    mode: value?.price_mode ?? 'fixed',
    margin: value?.profit_margin_percent ?? '',
    overhead: value?.overhead_cost ?? '',
  })
  const blank = fields(baseline)
  type Fields = typeof blank
  // A new product is kept per person and shop, so a reload or an accidental close does not lose it.
  const userId = useAuth().user?.id ?? ''
  const shopId = useShop().current?.shop_id ?? ''
  const [restored, setRestored] = useState(() => !keepsDraft ? null : loadDraft<Fields>('product', userId, shopId))
  const [f, setF] = useState<Fields>(restored?.data ?? blank)
  const dirtyText = JSON.stringify(f)
  useEffect(() => {
    if (!keepsDraft || !userId || !shopId) return
    if (dirtyText === JSON.stringify(blank)) clearDraft('product', userId, shopId)
    else saveDraft('product', userId, shopId, JSON.parse(dirtyText) as Fields)
  // `blank` is rebuilt from the same props each render; the saved text is what changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyText, keepsDraft, userId, shopId])
  const forget = () => { clearDraft('product', userId, shopId); setRestored(null) }
  // Dirty means different from a fresh form, so a restored draft counts and "Start again" does not.
  const leave = useDirtyClose(dirtyText !== JSON.stringify(blank), () => { if (keepsDraft) clearDraft('product', userId, shopId); close() })
  const formula = f.mode === 'formula'
  // The breakdown comes from the server, so what the owner sees is what billing charges.
  const priceInput: PriceInput | null = (formula ? isAmount(f.purchase) : isAmount(f.selling)) && [f.purchase, f.margin, f.overhead].every(v => !v.trim() || isAmount(v))
    ? { price_mode: f.mode, selling_price: formula ? null : f.selling.trim(), purchase_price: decimalOrNull(f.purchase), overhead_cost: formula ? decimalOrNull(f.overhead) : null, profit_margin_percent: formula ? decimalOrNull(f.margin) : null, gst_percent: decimalOrNull(f.gst), category_uuid: f.category || null }
    : null
  const settled = useDebounced(priceInput ? JSON.stringify(priceInput) : '', 300)
  const price = usePricePreview(settled ? JSON.parse(settled) as PriceInput : null)
  // Form keys → the API field each one is saved as, so a server complaint lands on the right input.
  const API: Partial<Record<keyof typeof f, string>> = { name: 'name', code: 'product_code', barcode: 'barcode', hsn: 'hsn_code', selling: 'selling_price', mrp: 'mrp_price', purchase: 'purchase_price', reorder: 'reorder_level', opening: 'opening_quantity', gst: 'gst_percent', category: 'category_uuid', unit: 'unit_uuid', supplier: 'supplier_uuid', margin: 'profit_margin_percent', overhead: 'overhead_cost' }
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => {
    setF({ ...f, [key]: e.target.value })
    const api = API[key]
    if (api && errors[api]) {
      const drop = (all: Record<string, string>) => { const rest = { ...all }; delete rest[api]; return rest }
      setInvalid(drop)
      setFieldErrors(drop)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (sending.current || stale) return
    const problems: Record<string, string> = {}
    if (!f.name.trim()) problems.name = 'Enter a product name.'
    if (!formula && !f.selling.trim()) problems.selling_price = 'Enter the price you sell this product at.'
    if (formula && !f.purchase.trim()) problems.purchase_price = 'Enter the cost price: the selling price is worked out from it.'
    const amounts: [string, string, string][] = [['selling_price', 'Selling price', formula ? '' : f.selling], ['purchase_price', 'Cost price', f.purchase], ['mrp_price', 'MRP', f.mrp], ['opening_quantity', 'Opening stock', f.opening], ['reorder_level', 'Reorder level', f.reorder], ['profit_margin_percent', 'Margin', formula ? f.margin : ''], ['overhead_cost', 'Overhead', formula ? f.overhead : '']]
    for (const [api, label, value] of amounts) {
      if (value.trim() !== '' && !isAmount(value)) problems[api] = `${label} must be a number, like 25 or 25.5.`
    }
    if (formula && isAmount(f.margin) && Number(f.margin) > 100) problems.profit_margin_percent = 'Margin can be at most 100%.'
    setInvalid(problems)
    setFieldErrors({})
    if (Object.keys(problems).length) {
      setError(Object.keys(problems).length === 1 ? Object.values(problems)[0]! : 'Some details need fixing. Check the highlighted fields.')
      setFocusTick(t => t + 1)
      return
    }
    setError(null)
    const body: Record<string, unknown> = {
      name: f.name.trim(),
      product_code: decimalOrNull(f.code),
      barcode: decimalOrNull(f.barcode),
      category_uuid: f.category || null,
      unit_uuid: f.unit || null,
      hsn_code: decimalOrNull(f.hsn),
      gst_percent: decimalOrNull(f.gst),
      price_mode: f.mode,
      ...(formula
        ? { profit_margin_percent: decimalOrNull(f.margin), overhead_cost: decimalOrNull(f.overhead) }
        : { selling_price: decimalOrNull(f.selling) }),
      mrp_price: decimalOrNull(f.mrp),
      reorder_level: decimalOrNull(f.reorder),
      track_stock: f.track,
    }
    // The cost fields exist for owners and admins only; a staff member never sees this form.
    body.supplier_uuid = f.supplier || null
    // The version this form was opened on: if someone changed the product since, the save is refused, not applied.
    if (editing) body.expected_updated_at = baseline?.updated_at
    body.purchase_price = decimalOrNull(f.purchase)
    if (!editing && decimalOrNull(f.opening)) body.opening_quantity = decimalOrNull(f.opening)
    sending.current = true
    try {
      const saved = await run(async () => {
        if (editing) {
          if (!baseline?.updated_at) throw new ApiError(409, 'missing_revision', 'This product has no saved version. Reload it before editing.')
          await assertProductEditSupport(shopId)
          if (!mounted.current) return
        }
        try { return await save.mutateAsync({ id: baseline?.uuid, body, retryKey: product ? undefined : retryKey(body) }) }
        catch (failure) { if (failure instanceof ApiError && failure.code === 'changed_elsewhere') { setStale(true); setLatest(null) }; throw failure }
      })
      if (saved && mounted.current) {
        if (keepsDraft) clearDraft('product', userId, shopId)
        setDelivering(true)
        try { await onSaved(saved.product.uuid, saved.product) }
        finally { if (mounted.current) setDelivering(false) }
      }
      else setFocusTick(t => t + 1)
    } finally { sending.current = false }
  }

  return (
    <Modal title={editing ? 'Edit product' : 'Add product'} onClose={leave} canClose={!busy} wide>
      <form ref={formRef} onSubmit={submit} noValidate className="product-form" aria-busy={busy}>
        {restored && <Alert kind="info">Your unfinished product from {new Date(restored.savedAt).toLocaleString()} was restored. <button type="button" className="link" onClick={() => { forget(); setF(blank) }}>Start again</button></Alert>}
        <p className="muted form-legend">Fields marked <span className="required-mark" aria-hidden="true">*</span> are required. Everything else is optional and can be added later.</p>
        {categories.error && <Alert>Categories could not be loaded. <button type="button" className="link" onClick={() => void categories.refetch()}>Retry categories</button></Alert>}
        {units.error && <Alert>Units could not be loaded. <button type="button" className="link" onClick={() => void units.refetch()}>Retry units</button></Alert>}
        <fieldset disabled={busy}>
          <FormSection title="Product details" description="Start with the name and how you organise this product.">
            <Field label="Product name" value={f.name} onChange={set('name')} maxLength={200} required autoFocus error={errors.name} />
            <div className="field">
              <div className="field-label-row"><label htmlFor="pf-cat">Category</label><button type="button" className="link" onClick={() => setAdding('category')}>+ New category</button></div>
              <select id="pf-cat" disabled={categories.isPending || categories.isError} value={f.category} onChange={set('category')}>
                <option value="">None</option>
                {categories.data?.map((c) => <option key={c.uuid} value={c.uuid}>{c.gst_percent === null ? c.name : `${c.name} · GST ${c.gst_percent}%`}</option>)}
              </select>
            </div>
            <div className="field">
              <div className="field-label-row"><label htmlFor="pf-unit">Unit</label><button type="button" className="link" onClick={() => setAdding('unit')}>+ New unit</button></div>
              <select id="pf-unit" disabled={units.isPending || units.isError} value={f.unit} onChange={set('unit')}>
                <option value="">None</option>
                {units.data?.map((u) => <option key={u.uuid} value={u.uuid}>{u.name}</option>)}
              </select>
            </div>
            <div className="field">
              <div className="field-label-row"><label htmlFor="pf-supplier">Preferred supplier (optional)</label><button type="button" className="link" onClick={() => setAddingSupplier(true)}>+ New supplier</button></div>
              <select id="pf-supplier" value={f.supplier} onChange={set('supplier')} disabled={suppliers.isPending || suppliers.isError}>
                <option value="">None</option>
                {f.supplier && !suppliers.data?.some(s => s.uuid === f.supplier) && <option value={f.supplier}>Current supplier</option>}
                {suppliers.data?.map(s => <option key={s.uuid} value={s.uuid}>{s.name}</option>)}
              </select>
              {suppliers.error && <Alert>Suppliers could not be loaded. <button type="button" className="link" onClick={() => void suppliers.refetch()}>Retry suppliers</button></Alert>}
              <small className="hint">Suggested when you record a purchase.</small>
            </div>
          </FormSection>
          <FormSection title="Pricing" description="Choose how this product is priced. The breakdown shows exactly what billing will charge.">
            <fieldset className="price-mode wide-row">
              <legend>How is the price set?</legend>
              <label className="check"><input type="radio" name="price-mode" checked={!formula} onChange={() => setF({ ...f, mode: 'fixed' })} />I set the selling price</label>
              <label className="check"><input type="radio" name="price-mode" checked={formula} onChange={() => setF({ ...f, mode: 'formula' })} />Work it out from cost + margin</label>
            </fieldset>
            {!formula && <Field label="Selling price (₹)" inputMode="decimal" value={f.selling} onChange={set('selling')} required error={errors.selling_price} />}
            <Field label="Cost price (₹)" inputMode="decimal" value={f.purchase} onChange={set('purchase')} required={formula} error={errors.purchase_price} hint={formula ? undefined : 'Used for profit and stock value.'} />
            {formula && <Field label="Margin (%)" inputMode="decimal" value={f.margin} onChange={set('margin')} error={errors.profit_margin_percent} hint="Leave blank to use the category or shop margin." />}
            {formula && <Field label="Overhead per unit (₹)" inputMode="decimal" value={f.overhead} onChange={set('overhead')} error={errors.overhead_cost} hint="Transport, packing and similar costs." />}
            <div className="field">
              <label htmlFor="pf-gst">GST rate</label>
              <select id="pf-gst" value={f.gst} onChange={set('gst')}>
                <option value="">Use the category or shop rate</option>
                {GST_RATES.map(g => <option key={g} value={g}>{g}%</option>)}
              </select>
            </div>
            <Field label="MRP (₹)" inputMode="decimal" value={f.mrp} onChange={set('mrp')} error={errors.mrp_price} />
            <div className="wide-row"><PriceBreakdown preview={priceInput ? price.data : undefined} pending={price.isFetching} error={priceInput ? price.error : null} /></div>
            {price.data && priceInput && isAmount(f.mrp) && Number(price.data.selling_price) > Number(f.mrp) && <Alert kind="info">The selling price is above MRP. Check the price before saving.</Alert>}
          </FormSection>
          <FormSection title="Stock" description="Track availability and choose when to reorder.">
            <label className="check wide-row"><input type="checkbox" checked={f.track} onChange={e => setF({ ...f, track: e.target.checked })} />Track stock for this product</label>
            {!editing && <Field label="Opening stock" inputMode="decimal" value={f.opening} onChange={set('opening')} hint="Actual stock on the shelf today. Leave blank if none yet. Receive stock before selling a tracked product." error={errors.opening_quantity} />}<Field label="Reorder level" inputMode="decimal" value={f.reorder} onChange={set('reorder')} error={errors.reorder_level} />
          </FormSection>
          <details className="optional-fields" open={editing || !!startingBarcode || ['product_code', 'barcode', 'hsn_code'].some(k => errors[k]) ? true : undefined}>
            <summary>Codes and HSN (optional)</summary><div className="form-grid">
              <Field label="Product code" value={f.code} onChange={set('code')} maxLength={64} error={errors.product_code} hint={editing ? undefined : 'Leave the code and barcode empty and Storely gives this product a code of its own.'} />
            <Field label="Barcode" value={f.barcode} onChange={set('barcode')} maxLength={64} error={errors.barcode} hint={editing ? undefined : 'Scan or type the one printed on the package, if it has one.'} />
            <Field label="HSN / SAC code" value={f.hsn} onChange={set('hsn')} maxLength={20} error={errors.hsn_code} />
            </div>
          </details>
        </fieldset>
        {/* Next to the Save button, where the eye is after clicking it. */}
        {error && <Alert>{error}</Alert>}
        {stale && <button type="button" disabled={busy} onClick={async () => {
          const result = await run(() => api.get<{ product: Product }>(`/v1/shops/${shopId}/products/${baseline!.uuid}`))
          if (result) {
            if (result.product.uuid !== baseline!.uuid || !result.product.updated_at) { setError('The latest product could not be safely reviewed. Your edits are kept.'); return }
            setLatest(result.product)
          }
        }}>Review latest product</button>}
        {stale && latest && <ProductConflictReview rows={changedFields(blank, f, fields(latest), { name: 'Name', supplier: 'Supplier', code: 'Product code', barcode: 'Barcode', category: 'Category', unit: 'Unit', hsn: 'HSN / SAC', gst: 'GST', selling: 'Selling price', mrp: 'MRP', purchase: 'Cost price', reorder: 'Reorder level', track: 'Track stock', mode: 'Pricing mode', margin: 'Margin', overhead: 'Overhead' }, (key, value) => {
          if (key === 'category') return categories.data?.find(category => category.uuid === value)?.name ?? (value ? 'Selected category' : 'None')
          if (key === 'unit') return units.data?.find(unit => unit.uuid === value)?.name ?? (value ? 'Selected unit' : 'None')
          if (key === 'supplier') return suppliers.data?.find(supplier => supplier.uuid === value)?.name ?? (value ? 'Selected supplier' : 'None')
          return typeof value === 'boolean' ? value ? 'Yes' : 'No' : value || 'None'
        })} onApply={() => {
          setF(rebaseEditedFields(blank, f, fields(latest))); setBaseline(latest); setLatest(null); setStale(false); setError(null)
        }} />}

        <div className="actions form-footer">
          <Button disabled={busy} onClick={leave}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || stale}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add product'}</Button>
        </div>
      </form>
      {adding === 'category' && <CategoryEditor onClose={() => setAdding(null)} onSaved={category => { setF(current => ({ ...current, category: category.uuid })); setAdding(null) }} />}
      {adding === 'unit' && <UnitEditor onClose={() => setAdding(null)} onSaved={unit => { setF(current => ({ ...current, unit: unit.uuid })); setAdding(null) }} />}
      {addingSupplier && <SupplierEditor onClose={() => setAddingSupplier(false)} onSaved={supplier => { setF(current => ({ ...current, supplier: supplier.uuid })); setAddingSupplier(false) }} />}
    </Modal>
  )
}
