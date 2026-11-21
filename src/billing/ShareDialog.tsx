import { useState, type FormEvent } from 'react'
import { Modal } from '../components/ui/Modal'
import { Alert, Field } from '../components/ui/ui'
import { useShop } from '../shops/context'
import { shareMessage, whatsappLink, whatsappNumber } from './share'
import type { BillDetail } from './queries'

/**
 * Review, then open WhatsApp. Opening a chat is all this can do: it cannot attach the invoice,
 * and it cannot tell whether the message was sent, so it never says "sent" or "delivered".
 * Nothing here changes the invoice, and closing the dialog has no side effects.
 */
export function ShareDialog({ detail, close }: { detail: BillDetail; close: () => void }) {
  const shopName = useShop().current?.name ?? ''
  const [phone, setPhone] = useState(detail.bill.customer_phone ?? '')
  const [message, setMessage] = useState(() => shareMessage(detail, shopName))
  const [problem, setProblem] = useState('')
  const [opened, setOpened] = useState(false)
  function submit(e: FormEvent) {
    e.preventDefault()
    const number = whatsappNumber(phone)
    if (!number) { setProblem('Enter the phone number with its country code, like 98765 43210 or +44 7911 123456.'); return }
    setProblem('')
    window.open(whatsappLink(number, message), '_blank', 'noopener,noreferrer')
    setOpened(true)
  }
  return <Modal title="Share on WhatsApp" onClose={close}>
    <form onSubmit={submit} noValidate>
      <Field label="Send to" type="tel" inputMode="tel" autoComplete="off" value={phone} error={problem || undefined}
        hint={detail.bill.customer_phone ? 'From the invoice. You can change it.' : 'This invoice has no phone number. Enter one to continue.'}
        onChange={e => { setPhone(e.target.value); setProblem('') }} />
      <label className="field-block">Message<textarea rows={5} maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} /></label>
      <p className="muted">This opens WhatsApp with the message ready for you to send. It cannot attach the invoice: print it or save it as a PDF, then attach it in the chat.</p>
      {opened && <Alert kind="info">WhatsApp was opened. Storely cannot see whether you sent the message.</Alert>}
      <div className="actions sticky-actions"><button className="primary">{opened ? 'Open WhatsApp again' : 'Open WhatsApp'}</button><button type="button" onClick={close}>{opened ? 'Done' : 'Cancel'}</button></div>
    </form>
  </Modal>
}
