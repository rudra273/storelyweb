import { useRef, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { Button } from '../components/workspace'
import { Modal } from '../components/Modal'
import { Alert, Field } from '../components/ui'
import { useAction } from '../components/useAction'
import { GST_RATES, useProductMutation, type Category, type Unit } from './queries'

/** Add a category without leaving the product form. GST and HSN are optional: when
 * set, the category's products use them unless a product sets its own. */
export function CategoryEditor({ onClose, onSaved }: { onClose: () => void; onSaved: (category: Category) => void }) {
  const sending = useRef(false)
  const save = useProductMutation((shop: string, body: { name: string; gst_percent: string | null; hsn_code: string | null }) => api.post<Category>(`/v1/shops/${shop}/categories`, body))
  const { busy, error, run, setError } = useAction()
  const [form, setForm] = useState({ name: '', gst: '', hsn: '' })
  const close = () => { if (!sending.current) onClose() }
  async function submit(event: FormEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (sending.current) return
    if (!form.name.trim()) { setError('Enter a category name.'); return }
    sending.current = true
    try {
      const saved = await run(() => save.mutateAsync({ name: form.name.trim(), gst_percent: form.gst || null, hsn_code: form.hsn.trim() || null }))
      if (saved) onSaved(saved)
    } finally { sending.current = false }
  }
  return <Modal title="New category" onClose={close} canClose={!busy}>
    <form onSubmit={submit} noValidate aria-busy={busy}>
      <fieldset disabled={busy}>
        <Field label="Category name" required autoFocus maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <div className="field">
          <label htmlFor="qc-gst">GST % (optional)</label>
          <select id="qc-gst" value={form.gst} onChange={e => setForm({ ...form, gst: e.target.value })}>
            <option value="">Not set</option>
            {GST_RATES.map(g => <option key={g} value={g}>{g}%</option>)}
          </select>
          <small className="hint">Products in this category use this rate unless they set their own.</small>
        </div>
        <Field label="HSN / SAC code (optional)" maxLength={20} value={form.hsn} onChange={e => setForm({ ...form, hsn: e.target.value })} />
      </fieldset>
      {error && <Alert>{error}</Alert>}
      <div className="actions"><Button disabled={busy} onClick={close}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Add category'}</Button></div>
    </form>
  </Modal>
}

export function UnitEditor({ onClose, onSaved }: { onClose: () => void; onSaved: (unit: Unit) => void }) {
  const sending = useRef(false)
  const save = useProductMutation((shop: string, name: string) => api.post<Unit>(`/v1/shops/${shop}/units`, { name }))
  const { busy, error, run, setError } = useAction()
  const [name, setName] = useState('')
  const close = () => { if (!sending.current) onClose() }
  async function submit(event: FormEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (sending.current) return
    if (!name.trim()) { setError('Enter a unit name, like pcs or kg.'); return }
    sending.current = true
    try {
      const saved = await run(() => save.mutateAsync(name.trim()))
      if (saved) onSaved(saved)
    } finally { sending.current = false }
  }
  return <Modal title="New unit" onClose={close} canClose={!busy}>
    <form onSubmit={submit} noValidate aria-busy={busy}>
      <fieldset disabled={busy}>
        <Field label="Unit name" required autoFocus maxLength={30} value={name} onChange={e => setName(e.target.value)} hint="For example: pcs, kg, box." />
      </fieldset>
      {error && <Alert>{error}</Alert>}
      <div className="actions"><Button disabled={busy} onClick={close}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Add unit'}</Button></div>
    </form>
  </Modal>
}
