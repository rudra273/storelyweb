import { useRef, useState, type FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Alert, Field } from '../../components/ui/ui'
import { Button } from '../../components/ui/workspace'
import { useAction } from '../../components/useAction'
import { saveSupplier, useProductMutation, type Supplier } from '../queries'
import { ACTION } from '../../lib/vocabulary'

export function SupplierEditor({ supplier, onClose, onSaved }: { supplier?: Supplier; onClose: () => void; onSaved: (supplier: Supplier) => void }) {
  const sending = useRef(false)
  const save = useProductMutation(saveSupplier)
  const { busy, error, run, setError } = useAction()
  const [form, setForm] = useState({ name: supplier?.name ?? '', phone: supplier?.phone ?? '', email: supplier?.email ?? '', gstin: supplier?.gstin ?? '', address: supplier?.address ?? '', notes: supplier?.notes ?? '' })
  const close = () => { if (!sending.current) onClose() }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (sending.current) return
    if (!form.name.trim()) { setError('Enter a supplier name.'); return }
    sending.current = true
    try {
      const body = { ...form, name: form.name.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null, gstin: form.gstin.trim().toUpperCase() || null, address: form.address.trim() || null, notes: form.notes.trim() || null }
      const saved = await run(() => save.mutateAsync({ id: supplier?.uuid, body }))
      if (saved) onSaved(saved)
    } finally { sending.current = false }
  }
  return <Modal title={supplier ? 'Edit supplier' : 'Add supplier'} onClose={close} canClose={!busy}>
    <form onSubmit={submit} aria-busy={busy}>
      {error && <Alert>{error}</Alert>}
      <fieldset disabled={busy}>
        <Field label="Supplier name" required autoFocus maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <details open={supplier ? true : undefined}><summary>Contact and business details (optional)</summary>
          {(['phone', 'email', 'gstin', 'address', 'notes'] as const).map(key => <Field key={key} maxLength={{ phone: 30, email: 254, gstin: 20, address: 500, notes: 500 }[key]} label={{ phone: 'Phone', email: 'Email', gstin: 'GSTIN', address: 'Address', notes: 'Notes' }[key]} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />)}
        </details>
      </fieldset>
      <div className="actions"><Button disabled={busy} onClick={close}>Cancel</Button><Button type="submit" variant="primary" disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : supplier ? ACTION.saveChanges : 'Add supplier'}</Button></div>
    </form>
  </Modal>
}
