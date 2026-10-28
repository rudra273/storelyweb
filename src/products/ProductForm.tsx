import { useState, type FormEvent } from 'react'
import { Modal } from '../components/Modal'
import { Alert, Field } from '../components/ui'
import { useAction } from '../components/useAction'
import { decimalOrNull, isAmount } from '../lib/money'
import { saveProduct, useCategories, useProductMutation, useUnits, type Product } from './queries'

const GST = ['0', '0.25', '3', '5', '12', '18', '28', '40']

/** Add a product (no `product`) or edit one. Stock is never typed in on edit: it is changed
 * with "Adjust stock", so the history always explains the number. */
export function ProductForm({ product, onClose, onSaved }: { product?: Product; onClose: () => void; onSaved: (id: string) => void }) {
  const editing = !!product
  const save = useProductMutation(saveProduct)
  const categories = useCategories()
  const units = useUnits()
  const { busy, error, run, setError } = useAction()
  const [f, setF] = useState({
    name: product?.name ?? '',
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
    body.purchase_price = decimalOrNull(f.purchase)
    if (!editing && decimalOrNull(f.opening)) body.opening_quantity = decimalOrNull(f.opening)
    const saved = await run(() => save.mutateAsync({ id: product?.uuid, body }))
    if (saved) onSaved(saved.product.uuid)
  }

  return (
    <Modal title={editing ? 'Edit product' : 'Add product'} onClose={onClose} wide>
      <form onSubmit={submit} noValidate className="form-grid">
        {error && <Alert>{error}</Alert>}
        {categories.error && <Alert>Categories could not be loaded. <button type="button" className="link" onClick={() => void categories.refetch()}>Retry categories</button></Alert>}
        {units.error && <Alert>Units could not be loaded. <button type="button" className="link" onClick={() => void units.refetch()}>Retry units</button></Alert>}
        <Field label="Product name" value={f.name} onChange={set('name')} maxLength={200} required autoFocus />
        <Field label="Product code" value={f.code} onChange={set('code')} maxLength={64} />
        <Field label="Barcode" value={f.barcode} onChange={set('barcode')} maxLength={64} />
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
        </div>
        <div className="field">
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
        <Field label="Selling price (₹)" inputMode="decimal" value={f.selling} onChange={set('selling')} />
        <Field label="MRP (₹)" inputMode="decimal" value={f.mrp} onChange={set('mrp')} />
        <Field label="Cost price (₹)" inputMode="decimal" value={f.purchase} onChange={set('purchase')} />
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
        <Field label="Reorder level" inputMode="decimal" value={f.reorder} onChange={set('reorder')} />
        {!editing && <Field label="Opening stock" inputMode="decimal" value={f.opening} onChange={set('opening')} hint="What is on the shelf today." />}
        <label className="check wide-row">
          <input type="checkbox" checked={f.track} onChange={(e) => setF({ ...f, track: e.target.checked })} />
          Track stock for this product
        </label>
        <div className="wide-row actions">
          <button className="primary" disabled={busy || !f.name.trim()}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add product'}
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
