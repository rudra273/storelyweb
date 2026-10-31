import { SupplierEditor } from './Suppliers'
import { CategoryEditor, UnitEditor } from './QuickCreate'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, FormSection } from '../components/workspace'
import { Modal } from '../components/Modal'
import { Alert, Field } from '../components/ui'
import { useAction } from '../components/useAction'
import { decimalOrNull, isAmount } from '../lib/money'
import { GST_RATES, saveProduct, useCategories, useProductMutation, useUnits, useSuppliers, type Product } from './queries'

/** Add a product (no `product`) or edit one. Stock is never typed in on edit: it is changed
 * with "Adjust stock", so the history always explains the number. */
export function ProductForm({ product, onClose, onSaved }: { product?: Product; onClose: () => void; onSaved: (id: string) => void }) {
  const sending = useRef(false)
  const close = () => { if (!sending.current) onClose() }
  const editing = !!product
  const save = useProductMutation(saveProduct)
  const categories = useCategories()
  const units = useUnits()
  const suppliers = useSuppliers()
  const [addingSupplier, setAddingSupplier] = useState(false)
  const [adding, setAdding] = useState<'category' | 'unit' | null>(null)
  const { busy, error, run, setError, fieldErrors, setFieldErrors } = useAction()
  const formRef = useRef<HTMLFormElement>(null)
  const [invalid, setInvalid] = useState<Record<string, string>>({})
  const errors = { ...fieldErrors, ...invalid }
  const [focusTick, setFocusTick] = useState(0)
  // After a failed save, take the shop owner straight to the first field that needs fixing.
  useEffect(() => { if (focusTick) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus() }, [focusTick])
  const [f, setF] = useState({
    name: product?.name ?? '',
    supplier: product?.supplier_uuid ?? '',
    code: product?.product_code ?? '',
    barcode: product?.barcode ?? '',
    category: product?.category_uuid ?? '',
    unit: product?.unit_uuid ?? '',
    hsn: product?.hsn_code ?? '',
    gst: product?.gst_percent ?? '',
    selling: product?.selling_price ?? '',
    mrp: product?.mrp_price ?? '',
    purchase: product?.purchase_price ?? '',
    reorder: product?.reorder_level ?? '',
    track: product?.track_stock ?? true,
    opening: '',
  })
  // Form keys → the API field each one is saved as, so a server complaint lands on the right input.
  const API: Partial<Record<keyof typeof f, string>> = { name: 'name', code: 'product_code', barcode: 'barcode', hsn: 'hsn_code', selling: 'selling_price', mrp: 'mrp_price', purchase: 'purchase_price', reorder: 'reorder_level', opening: 'opening_quantity', gst: 'gst_percent', category: 'category_uuid', unit: 'unit_uuid', supplier: 'supplier_uuid' }
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
    if (sending.current) return
    const problems: Record<string, string> = {}
    if (!f.name.trim()) problems.name = 'Enter a product name.'
    if (!f.selling.trim()) problems.selling_price = 'Enter the price you sell this product at.'
    const amounts: [string, string, string][] = [['selling_price', 'Selling price', f.selling], ['purchase_price', 'Cost price', f.purchase], ['mrp_price', 'MRP', f.mrp], ['opening_quantity', 'Opening stock', f.opening], ['reorder_level', 'Reorder level', f.reorder]]
    for (const [api, label, value] of amounts) {
      if (value.trim() !== '' && !isAmount(value)) problems[api] = `${label} must be a number, like 25 or 25.5.`
    }
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
      selling_price: decimalOrNull(f.selling),
      mrp_price: decimalOrNull(f.mrp),
      reorder_level: decimalOrNull(f.reorder),
      track_stock: f.track,
    }
    // The cost fields exist for owners and admins only; a staff member never sees this form.
    body.supplier_uuid = f.supplier || null
    body.purchase_price = decimalOrNull(f.purchase)
    if (!editing && decimalOrNull(f.opening)) body.opening_quantity = decimalOrNull(f.opening)
    sending.current = true
    try {
      const saved = await run(() => save.mutateAsync({ id: product?.uuid, body }))
      if (saved) onSaved(saved.product.uuid)
      else setFocusTick(t => t + 1)
    } finally { sending.current = false }
  }

  return (
    <Modal title={editing ? 'Edit product' : 'Add product'} onClose={close} canClose={!busy} wide>
      <form ref={formRef} onSubmit={submit} noValidate className="product-form" aria-busy={busy}>
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
          <FormSection title="Pricing" description="Set your selling price and purchase cost.">
            <Field label="Selling price (₹)" inputMode="decimal" value={f.selling} onChange={set('selling')} required error={errors.selling_price} />
            <Field label="Cost price (₹)" inputMode="decimal" value={f.purchase} onChange={set('purchase')} error={errors.purchase_price} />
            <Field label="MRP (₹)" inputMode="decimal" value={f.mrp} onChange={set('mrp')} error={errors.mrp_price} />
            {isAmount(f.selling) && isAmount(f.mrp) && Number(f.selling) > Number(f.mrp) && <Alert kind="info">Selling price is above MRP. Check the price before saving.</Alert>}
          </FormSection>
          <FormSection title="Stock" description="Track availability and choose when to reorder.">
            <label className="check wide-row"><input type="checkbox" checked={f.track} onChange={e => setF({ ...f, track: e.target.checked })} />Track stock for this product</label>
            {!editing && <Field label="Opening stock" inputMode="decimal" value={f.opening} onChange={set('opening')} hint="What is on the shelf today." error={errors.opening_quantity} />}<Field label="Reorder level" inputMode="decimal" value={f.reorder} onChange={set('reorder')} error={errors.reorder_level} />
          </FormSection>
          <details className="optional-fields" open={editing || ['product_code', 'barcode', 'hsn_code', 'gst_percent'].some(k => errors[k]) ? true : undefined}>
            <summary>Codes and tax details (optional)</summary><div className="form-grid">
              <Field label="Product code" value={f.code} onChange={set('code')} maxLength={64} error={errors.product_code} />
            <Field label="Barcode" value={f.barcode} onChange={set('barcode')} maxLength={64} error={errors.barcode} />
            <Field label="HSN / SAC code" value={f.hsn} onChange={set('hsn')} maxLength={20} error={errors.hsn_code} />
            <div className="field">
          <label htmlFor="pf-gst">GST %</label>
          <select id="pf-gst" value={f.gst} onChange={set('gst')}>
            <option value="">Not set</option>
            {GST_RATES.map((g) => (
              <option key={g} value={g}>
                {g}%
              </option>
            ))}
          </select>
        </div>
            </div>
          </details>
        </fieldset>
        {/* Next to the Save button, where the eye is after clicking it. */}
        {error && <Alert>{error}</Alert>}
        <div className="actions form-footer">
          <Button disabled={busy} onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add product'}</Button>
        </div>
      </form>
      {adding === 'category' && <CategoryEditor onClose={() => setAdding(null)} onSaved={category => { setF(current => ({ ...current, category: category.uuid })); setAdding(null) }} />}
      {adding === 'unit' && <UnitEditor onClose={() => setAdding(null)} onSaved={unit => { setF(current => ({ ...current, unit: unit.uuid })); setAdding(null) }} />}
      {addingSupplier && <SupplierEditor onClose={() => setAddingSupplier(false)} onSaved={supplier => { setF(current => ({ ...current, supplier: supplier.uuid })); setAddingSupplier(false) }} />}
    </Modal>
  )
}
