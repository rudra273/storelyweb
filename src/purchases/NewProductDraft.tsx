import { useState, type FormEvent } from 'react'
import { Modal } from '../components/Modal'
import { Alert, Field } from '../components/ui'
import { Button } from '../components/workspace'
import { useCategories, useUnits, useProducts } from '../products/queries'
import { amountInCents, type DraftLine } from './draft'
import type { NewReceiptProduct } from './contracts'
import { useDebounced } from '../lib/useDebounced'

export function NewProductDraft({ line, onClose, onStage }: { line?: DraftLine; onClose: () => void; onStage: (line: DraftLine) => void }) {
  const original = line?.new_product
  const [form, setForm] = useState({ name: original?.name ?? '', product_code: original?.product_code ?? '', barcode: original?.barcode ?? '', selling_price: original?.selling_price ?? '', unit_name: original?.unit_name ?? 'pcs', category_name: original?.category_name ?? '', hsn_code: original?.hsn_code ?? '', gst_percent: original?.gst_percent ?? '', mrp_price: original?.mrp_price ?? '', reorder_level: original?.reorder_level ?? '' })
  const [quantity, setQuantity] = useState(line?.quantity ?? '1')
  const [cost, setCost] = useState(line?.unit_cost ?? '')
  const [error, setError] = useState<string | null>(null)
  const units = useUnits(), categories = useCategories()
  const nameQuery = useDebounced(form.name, 250)
  const existing = useProducts({ q: nameQuery, category: '', low: false, expiring: false, sort: 'name', dir: 'asc', page: 0 })
  const duplicates = !!form.name.trim() && existing.data?.items.some(p => p.name.trim().toLowerCase() === form.name.trim().toLowerCase())
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!form.name.trim()) { setError('Enter a product name.'); return }
    if (amountInCents(quantity, cost) === null) { setError('Enter a positive quantity and non-negative unit cost.'); return }
    for (const field of ['selling_price', 'mrp_price', 'reorder_level'] as const) {
      if (form[field].trim() && amountInCents('1', form[field]) === null) { setError('Check selling price, MRP and reorder level.'); return }
    }
    if (form.gst_percent && (!/^\d{1,3}(\.\d{1,2})?$/.test(form.gst_percent) || Number(form.gst_percent) > 100)) { setError('GST must be between 0 and 100.'); return }
    const spec: NewReceiptProduct = { client_key: original?.client_key ?? crypto.randomUUID(), name: form.name.trim(), ...Object.fromEntries(Object.entries(form).filter(([key]) => key !== 'name').map(([key, value]) => [key, value.trim() || null])) }
    onStage({ id: line?.id ?? crypto.randomUUID(), product_uuid: '', new_product: spec, name: spec.name, unit: spec.unit_name ?? null, quantity: quantity.trim(), unit_cost: cost.trim(), batch_no: line?.batch_no ?? '', expiry_date: line?.expiry_date ?? '', ...(line?.import_key ? { import_key: line.import_key, import_row_number: line.import_row_number } : {}) })
  }
  const field = (key: keyof typeof form, label: string, maxLength: number, decimal = false) => <Field label={label} maxLength={maxLength} inputMode={decimal ? 'decimal' : undefined} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />
  return <Modal title={line ? 'Edit staged product' : 'New product for purchase'} onClose={onClose}>
    <p className="muted">This product will be created only when you save the purchase.</p>
    <form onSubmit={submit} noValidate>
      {error && <Alert>{error}</Alert>}
      {field('name', 'New product name', 200)}
      {duplicates && <Alert kind="info">A product with this name already exists. Use the purchase search to restock it, or give this distinct item its own code.</Alert>}
      <div className="purchase-line-fields"><Field label="New product quantity" inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} /><Field label="New product unit cost (₹)" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} /></div>
      {field('selling_price', 'Selling price (₹, optional)', 16, true)}
      <Field label="Unit name (optional)" list="purchase-unit-options" maxLength={30} value={form.unit_name} onChange={e => setForm({ ...form, unit_name: e.target.value })} />
      <datalist id="purchase-unit-options">{units.data?.map(u => <option key={u.uuid} value={u.name} />)}</datalist>
      <details><summary>Codes, category and tax (optional)</summary>
        {field('product_code', 'Product code', 64)}{field('barcode', 'Barcode', 64)}
        <Field label="Category name" list="purchase-category-options" maxLength={100} value={form.category_name} onChange={e => setForm({ ...form, category_name: e.target.value })} /><datalist id="purchase-category-options">{categories.data?.map(c => <option key={c.uuid} value={c.name} />)}</datalist>
        {field('hsn_code', 'HSN / SAC', 20)}{field('gst_percent', 'GST %', 6, true)}{field('mrp_price', 'MRP (₹)', 16, true)}{field('reorder_level', 'Reorder level', 16, true)}
      </details>
      <div className="actions"><Button onClick={onClose}>Cancel new product</Button><Button type="submit" variant="primary">{line ? 'Update staged product' : 'Stage product'}</Button></div>
    </form>
  </Modal>
}
