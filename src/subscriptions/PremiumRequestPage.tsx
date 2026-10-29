import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import type { components } from '../api/schema'
import { api, ApiError } from '../api/client'
import { useAuth } from '../auth/context'
import { Alert, Card, Field } from '../components/ui'
import { Button, PageHeader } from '../components/workspace'
import { useAction } from '../components/useAction'
import { RequestStatus } from './Status'

type RequestBody = components['schemas']['WebRequestIn']
export function PremiumRequestPage() {
  const { user } = useAuth()
  const client = useQueryClient()
  const [kind, setKind] = useState<RequestBody['request_kind']>('existing_android')
  const [shop, setShop] = useState('')
  const [name, setName] = useState('')
  const [contact, setContact] = useState(user?.full_name ?? '')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [attempt, setAttempt] = useState<RequestBody | null>(null)
  const [sent, setSent] = useState(false)
  const { busy, error, run } = useAction()
  async function submit(event: FormEvent) {
    event.preventDefault()
    const body: RequestBody = attempt ?? { id: crypto.randomUUID(), request_kind: kind, shop_id: kind === 'existing_android' ? shop.trim() : null, shop_name: name.trim(), contact_name: contact.trim(), phone: phone.trim(), contact_consent: true }
    setAttempt(body)
    const result = await run(async () => {
      try { return await api.post<components['schemas']['MyPremiumRequestOut']>('/v1/me/premium-requests', body) }
      catch (error) {
        if (error instanceof ApiError && (error.status === 422 || error.code === 'request_not_ready')) setAttempt(null)
        throw error
      }
    })
    if (result) {
      setSent(true)
      await client.invalidateQueries({queryKey:['my-premium-requests']})
    }
  }
  return <><PageHeader eyebrow="STORELY PREMIUM" title="Request Premium" description="Request cloud sync and web access. Our team will contact you to review your request." />
    <p><Link to="/">Back to workspace</Link> · <Link to="/account/security">Account security</Link></p>
    <Card title="Contact and shop details">{sent ? <Alert kind="success">Your request was received. Track its status below. No subscription or charge starts just by submitting a request.</Alert> : <form onSubmit={submit}>
      <p>Requesting as <strong>{user?.email}</strong>. Approval and activation will be tied to this verified account.</p>
      {error && <Alert>{error} You can retry the same request or refresh its status below. A request may already have been received.</Alert>}
      {attempt && !sent && !busy && <p className="muted">The submitted details are kept for a safe retry. Check your requests below before starting another.</p>}
      <fieldset disabled={busy || attempt !== null} className="ui-form-section"><legend>Which shop is this for?</legend>
        <label className="check"><input type="radio" name="shop-kind" value="existing_android" checked={kind==='existing_android'} onChange={()=>setKind('existing_android')} />My existing Android shop</label>
        <label className="check"><input type="radio" name="shop-kind" value="new_cloud" checked={kind==='new_cloud'} onChange={()=>setKind('new_cloud')} />A new shop starting on the web</label>
        {kind==='existing_android' ? <Field label="Android shop code" value={shop} onChange={e=>setShop(e.target.value)} required minLength={8} maxLength={64} pattern={'[A-Za-z0-9_\\-]{8,64}'} hint="Copy it from Store → Cloud Backup & Sync → Request Premium on your phone. This keeps your existing shop identity and data." /> : <p>Choose this only if you do not already have Android shop data to bring over. After approval, you can explicitly activate a new empty cloud shop here.</p>}
        <Field label="Shop name" required maxLength={120} value={name} onChange={e=>setName(e.target.value)} />
        <Field label="Contact name" required maxLength={120} value={contact} onChange={e=>setContact(e.target.value)} />
        <Field label="Phone with country code" type="tel" required pattern="\+[1-9][0-9]{7,14}" maxLength={16} placeholder="+919876543210" value={phone} onChange={e=>setPhone(e.target.value)} />
        <label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required />I agree that the Storely team may contact me about this premium request.</label>
      </fieldset>
      <Button type="submit" variant="primary" disabled={busy || !consent || !name.trim() || !contact.trim() || !/^\+[1-9][0-9]{7,14}$/.test(phone.trim()) || (kind==='existing_android' && !/^[A-Za-z0-9_-]{8,64}$/.test(shop.trim()))}>{busy ? 'Sending…' : attempt ? 'Retry same request' : 'Send premium request'}</Button>
      <p className="muted">For an already registered cloud shop, arrange renewal or recovery with the Storely team; do not create a duplicate shop.</p>
    </form>}</Card>
    <RequestStatus />
  </>
}
