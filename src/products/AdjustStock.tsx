import { useState, type FormEvent } from 'react'
import { Modal } from '../components/Modal'
import { Alert, Field } from '../components/ui'
import { useAction } from '../components/useAction'
import { formatQty, isAmount } from '../lib/money'
import { adjustStock, REASONS, useProductMutation, type Product } from './queries'

export function AdjustStock({ product, onClose }: { product: Product; onClose: () => void }) {
  const save = useProductMutation(adjustStock)
  const { busy, error, run, setError } = useAction()
  const [direction, setDirection] = useState<'add' | 'remove'>('remove')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState<string>('damage')
  const [note, setNote] = useState('')
  const reasons = REASONS.filter((r) => (direction === 'remove' ? r.removes || r.value === 'count' || r.value === 'other' : !r.removes))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!isAmount(amount) || Number(amount) === 0) {
      setError('Enter how many to add or remove, like 3 or 2.5.')
      return
    }
    const done = await run(() => save.mutateAsync({ id: product.uuid, delta: direction === 'remove' ? `-${amount.trim()}` : amount.trim(), reason, note: note.trim() || null }))
    if (done) onClose()
  }

  return (
    <Modal title={`Adjust stock · ${product.name}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="muted">
          Now in stock: <strong>{formatQty(product.quantity)}</strong> {product.unit_name ?? ''}
        </p>
        {error && <Alert>{error}</Alert>}
        <div className="field">
          <label htmlFor="adj-dir">What happened</label>
          <select
            id="adj-dir"
            value={direction}
            onChange={(e) => {
              const next = e.target.value as 'add' | 'remove'
              setDirection(next)
              setReason(next === 'remove' ? 'damage' : 'return')
            }}
          >
            <option value="remove">Stock went out</option>
            <option value="add">Stock came in</option>
          </select>
        </div>
        <Field label="Quantity" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        <div className="field">
          <label htmlFor="adj-reason">Reason</label>
          <select id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {reasons.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <Field label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        <div className="actions">
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
