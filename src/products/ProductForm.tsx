import { SupplierEditor } from './Suppliers'
import { useRef, useState, type FormEvent } from 'react'
import { Button, FormSection } from '../components/workspace'
import { Modal } from '../components/Modal'
import { Alert, Field } from '../components/ui'
import { useAction } from '../components/useAction'
import { decimalOrNull, isAmount } from '../lib/money'
import { saveProduct, useCategories, useProductMutation, useUnits, useSuppliers, type Product } from './queries'

const GST = ['0', '0.25', '3', '5', '12', '18', '28', '40']

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
  const { busy, error, run, setError } = useAction()
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
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [key]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (sending.current) return
    if (!f.name.trim()) { setError('Product name is required.'); return }
    const amounts: [string, string][] = [['Selling price', f.selling], ['MRP', f.mrp], ['Cost price', f.purchase], ['Reorder level', f.reorder], ['Opening stock', f.opening]]
    for (const [label, value] of amounts) {
      if (value.trim() !== '' && !isAmount(value)) {
        setError(`${label} must be a number like 25 or 25.5.`)
        return
      }
    }
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
    } finally { sending.current = false }
  }

  return (
    <Modal title={editing ? 'Edit product' : 'Add product'} onClose={close} canClose={!busy} wide>
      <form onSubmit={submit} noValidate className="product-form" aria-busy={busy}>
        {error && <Alert>{error}</Alert>}
        {categories.error && <Alert>Categories could not be loaded. <button type="button" className="link" onClick={() => void categories.refetch()}>Retry categories</button></Alert>}
        {units.error && <Alert>Units could not be loaded. <button type="button" className="link" onClick={() => void units.refetch()}>Retry units</button></Alert>}
        <fieldset disabled={busy}>
          <FormSection title="Product details" description="Start with the name and how you organise this product.">
            <Field label="Product name" value={f.name} onChange={set('name')} maxLength={200} required autoFocus />
            <div className="field">
          <label htmlFor="pf-cat">Category</label>
          <select id="pf-cat" disabled={categories.isPending || categories.isError} value={f.category} onChange={set('category')}>
            <option value="">None</option>
            {categories.data?.map((c) => (
              <option key={c.uuid} value={c.uuid}>
                {c.name}
              </option>
            ))}
          </select>
        </div><div className="field">
          <label htmlFor="pf-unit">Unit</label>
          <select id="pf-unit" disabled={units.isPending || units.isError} value={f.unit} onChange={set('unit')}>
            <option value="">None</option>
            {units.data?.map((u) => (
              <option key={u.uuid} value={u.uuid}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
          </FormSection>
          <div className="field">
            <label htmlFor="pf-supplier">Preferred supplier (optional)</label>
            <select id="pf-supplier" value={f.supplier} onChange={set('supplier')} disabled={suppliers.isPending || suppliers.isError}>
              <option value="">None</option>
              {f.supplier && !suppliers.data?.some(s => s.uuid === f.supplier) && <option value={f.supplier}>Current supplier</option>}
              {suppliers.data?.map(s => <option key={s.uuid} value={s.uuid}>{s.name}</option>)}
            </select>
            {suppliers.error && <Alert>Suppliers could not be loaded. <button type="button" className="link" onClick={() => void suppliers.refetch()}>Retry suppliers</button></Alert>}
            <Button onClick={() => setAddingSupplier(true)}>Add supplier</Button>
            <small className="muted">Used as a suggestion for future purchases.</small>
          </div>
          <FormSection title="Pricing" description="Set your selling price and purchase cost.">
            <Field label="Selling price (₹)" inputMode="decimal" value={f.selling} onChange={set('selling')} />
            <Field label="Cost price (₹)" inputMode="decimal" value={f.purchase} onChange={set('purchase')} />
            <Field label="MRP (₹)" inputMode="decimal" value={f.mrp} onChange={set('mrp')} />
            {isAmount(f.selling) && isAmount(f.mrp) && Number(f.selling) > Number(f.mrp) && <Alert kind="info">Selling price is above MRP. Check the price before saving.</Alert>}
          </FormSection>
          <FormSection title="Stock" description="Track availability and choose when to reorder.">
            <label className="check wide-row"><input type="checkbox" checked={f.track} onChange={e => setF({ ...f, track: e.target.checked })} />Track stock for this product</label>
            {!editing && <Field label="Opening stock" inputMode="decimal" value={f.opening} onChange={set('opening')} hint="What is on the shelf today." />}<Field label="Reorder level" inputMode="decimal" value={f.reorder} onChange={set('reorder')} />
          </FormSection>
          <details className="optional-fields" open={editing ? true : undefined}>
            <summary>Codes and tax details (optional)</summary><div className="form-grid">
              <Field label="Product code" value={f.code} onChange={set('code')} maxLength={64} />
            <Field label="Barcode" value={f.barcode} onChange={set('barcode')} maxLength={64} />
            <Field label="HSN / SAC code" value={f.hsn} onChange={set('hsn')} maxLength={20} />
            <div className="field">
          <label htmlFor="pf-gst">GST %</label>
          <select id="pf-gst" value={f.gst} onChange={set('gst')}>
            <option value="">Not set</option>
            {GST.map((g) => (
              <option key={g} value={g}>
                {g}%
              </option>
            ))}
          </select>
        </div>
            </div>
          </details>
        </fieldset>
        <div className="actions form-footer">
          <Button disabled={busy} onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add product'}</Button>
        </div>
      </form>
      {addingSupplier && <SupplierEditor onClose={() => setAddingSupplier(false)} onSaved={supplier => { setF(current => ({ ...current, supplier: supplier.uuid })); setAddingSupplier(false) }} />}
    </Modal>
  )
}
