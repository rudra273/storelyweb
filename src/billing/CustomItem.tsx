import { saleQuantity, SALE_QUANTITY_ERROR } from './checkout/quantity'
import { useState, type FormEvent } from 'react'
import { Button } from '../components/ui/workspace'
import { Modal } from '../components/ui/Modal'
import { Alert, Field } from '../components/ui/ui'
import { isAmount } from '../lib/money'
import { GST_RATES } from '../products/queries'

export interface CustomLine { key: string; name: string; unit_price: string; gst_percent: string; quantity: string; cost: string; hsn_code: string; unit: string }

/** An item that is not in the product list (a service, a one-off). No stock moves for it.
 * The GST rate is always chosen here: nothing is applied without the owner seeing it. */
export function CustomItemEditor({ onClose, onAdd, initialName = '' }: { onClose: () => void; onAdd: (line: CustomLine) => void; initialName?: string }) {
  const [form, setForm] = useState({ name: initialName, unit_price: '', gst_percent: '', quantity: '1', cost: '', hsn_code: '', unit: '' })
  const [problems, setProblems] = useState<Record<string, string>>({})
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  function submit(event: FormEvent) {
    event.preventDefault()
    event.stopPropagation()
    const found: Record<string, string> = {}
    if (!form.name.trim()) found.name = 'Enter what you are selling.'
    if (!isAmount(form.unit_price)) found.unit_price = 'Enter the price, like 50 or 49.5.'
    if (!form.gst_percent) found.gst_percent = 'Choose the GST rate (0% if none).'
    if (saleQuantity(form.quantity) === null) found.quantity = SALE_QUANTITY_ERROR
    if (form.cost.trim() && !isAmount(form.cost)) found.cost = 'Cost must be a number, like 20.'
    setProblems(found)
    if (Object.keys(found).length) return
    onAdd({ ...form, key: crypto.randomUUID(), name: form.name.trim(), hsn_code: form.hsn_code.trim(), unit: form.unit.trim() })
  }
  return <Modal title="Item not in the product list" onClose={onClose}>
    <form onSubmit={submit} noValidate>
      <p className="muted form-legend">For a service or a one-off sale. No stock is moved. Fields marked <span className="required-mark" aria-hidden="true">*</span> are required.</p>
      <Field label="Item name" required autoFocus maxLength={200} value={form.name} onChange={set('name')} error={problems.name} />
      <div className="form-grid">
        <Field label="Price (₹)" required inputMode="decimal" value={form.unit_price} onChange={set('unit_price')} error={problems.unit_price} hint="Per unit, as charged to the customer." />
        <Field label="Quantity" required inputMode="decimal" value={form.quantity} onChange={set('quantity')} error={problems.quantity} />
        <div className="field">
          <label htmlFor="ci-gst" className="required-label">GST rate</label>
          <select id="ci-gst" value={form.gst_percent} onChange={set('gst_percent')} aria-invalid={problems.gst_percent ? true : undefined} aria-describedby={problems.gst_percent ? 'ci-gst-error' : undefined}>
            <option value="">Choose…</option>
            {GST_RATES.map(g => <option key={g} value={g}>{g}%</option>)}
          </select>
          {problems.gst_percent && <small id="ci-gst-error" className="field-error">{problems.gst_percent}</small>}
        </div>
        <Field label="Unit (optional)" maxLength={30} value={form.unit} onChange={set('unit')} placeholder="pcs" />
        <Field label="Your cost per unit (₹, optional)" inputMode="decimal" value={form.cost} onChange={set('cost')} error={problems.cost} hint="Used for profit reports." />
        <Field label="HSN / SAC code (optional)" maxLength={20} value={form.hsn_code} onChange={set('hsn_code')} />
      </div>
      {Object.keys(problems).length > 0 && <Alert>Some details need fixing. Check the highlighted fields.</Alert>}
      <div className="actions"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Add to invoice</Button></div>
    </form>
  </Modal>
}
