import { useState, type FormEvent, type ReactNode } from 'react'
import { Modal } from '../components/ui/Modal'
import { Alert } from '../components/ui/ui'
import { Button } from '../components/ui/workspace'
import { useAction } from '../components/useAction'
import './purchases.css'

/**
 * Asks why before something posted is reversed, and says plainly what will happen.
 * Reversing again after a lost reply is safe, so a failed attempt is simply tried again.
 */
export function ReasonDialog({ title, effects, confirmLabel, onConfirm, onClose, help }: {
  title: string
  effects: ReactNode
  confirmLabel: string
  onConfirm: (reason: string) => Promise<unknown>
  onClose: () => void
  help?: ReactNode
}) {
  const { busy, error, run } = useAction()
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const short = reason.trim().length < 3
  async function submit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (short || busy) return
    const done = await run(async () => { await onConfirm(reason.trim()); return true })
    if (done) onClose()
  }
  return <Modal title={title} onClose={onClose} canClose={!busy}>
    <form onSubmit={submit} noValidate aria-busy={busy}>
      <div className="reverse-effects">{effects}</div>
      <div className="field">
        <label htmlFor="reversal-reason" className="required-label">Why is this being reversed?</label>
        <textarea id="reversal-reason" rows={3} maxLength={300} autoFocus value={reason} disabled={busy} aria-invalid={touched && short ? true : undefined} onChange={e => setReason(e.target.value)} />
        {touched && short && <small className="field-error" role="alert">Give a reason of at least 3 characters. It stays on the record.</small>}
      </div>
      {error && <Alert>{error}</Alert>}
      {error && help}
      <div className="actions"><Button disabled={busy} onClick={onClose}>Keep it</Button><Button type="submit" variant="danger" disabled={busy}>{busy ? 'Reversing…' : confirmLabel}</Button></div>
    </form>
  </Modal>
}
