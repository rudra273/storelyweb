import { useRef, useState, type FormEvent } from 'react'
import { receiptMoney } from '../../purchases/composer/money'
import { SupplierStatement } from './SupplierStatement'
import { Modal } from '../../components/ui/Modal'
import { Alert, Field, Loading } from '../../components/ui/ui'
import { Button } from '../../components/ui/workspace'
import { useAction } from '../../components/useAction'
import { saveSupplier, useProductMutation, useSuppliers, type Supplier } from '../queries'

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
      <div className="actions"><Button disabled={busy} onClick={close}>Cancel</Button><Button type="submit" variant="primary" disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Save supplier'}</Button></div>
    </form>
  </Modal>
}

export function SuppliersManager({ onClose }: { onClose: () => void }) {
  const suppliers = useSuppliers()
  const [statement, setStatement] = useState<Supplier | null>(null)
  const [owing, setOwing] = useState(false)
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<Supplier | 'new' | null>(null)
  const rows = suppliers.data?.filter(s => (!owing || Number(s.balance_due ?? '0') > 0) && [s.name, s.phone, s.gstin].some(value => value?.toLowerCase().includes(search.trim().toLowerCase()))).sort((a, b) => Number(b.balance_due ?? '0') - Number(a.balance_due ?? '0'))
  return <Modal title="Suppliers" onClose={onClose} wide>
    {suppliers.isPending && <Loading />}
    {suppliers.error && <Alert>Suppliers could not be loaded. <button className="link" onClick={() => void suppliers.refetch()}>Retry suppliers</button></Alert>}
    <div className="actions"><Field label="Search suppliers" value={search} onChange={e => setSearch(e.target.value)} /><Button variant="primary" onClick={() => setEditor('new')}>Add supplier</Button></div>
    {rows?.length === 0 && <p className="muted">{search ? 'No suppliers match.' : 'No suppliers yet. Add your first supplier.'}</p>}
    <label><input type="checkbox" checked={owing} onChange={e => setOwing(e.target.checked)} /> Only suppliers we owe</label>
    <ul className="plain">{rows?.map(s => <li key={s.uuid} className="row"><span><strong>{s.name}</strong><br /><span>Balance due: {receiptMoney(s.balance_due ?? '0')}</span><br /><small>{[s.phone, s.gstin].filter(Boolean).join(' · ')}</small></span><div className="actions"><Button onClick={() => setStatement(s)}>Statement and payments</Button><Button onClick={() => setEditor(s)}>Edit {s.name}</Button></div></li>)}</ul>
    {statement && <SupplierStatement supplier={statement} onClose={() => setStatement(null)} />}
    {editor && <SupplierEditor supplier={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSaved={() => setEditor(null)} />}
  </Modal>
}
