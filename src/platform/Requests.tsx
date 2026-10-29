import { QueryState, Pager, Status } from './Bits'
import { useState, type FormEvent } from 'react'
import { request } from '../api/client'
import { Modal } from '../components/Modal'
import { Alert, Empty, Field } from '../components/ui'
import { Button, PageHeader } from '../components/workspace'
import { useAction } from '../components/useAction'
import { date, localDate, PAGE, usePlatform, useRefreshPlatform, type Schemas } from './shared'

type PremiumRequest = Schemas['PlatformRequestOut']
export function PlatformRequests() {
  const [filter, setFilter] = useState('pending')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<PremiumRequest | null>(null)
  const refresh = useRefreshPlatform()
  const q = usePlatform<PremiumRequest[]>(`/premium-requests?${new URLSearchParams({ ...(filter ? { status: filter } : {}), limit: String(PAGE), offset: String(offset) })}`)
  return <><PageHeader eyebrow="PREMIUM OPERATIONS" title="Premium requests" description="Review contact requests and approve a verified owner. Existing Android shops activate on the phone; new cloud shops can activate on the web." actions={<Button onClick={() => void q.refetch()}>Refresh</Button>} />
    <label>Status <select value={filter} onChange={e => { setFilter(e.target.value); setOffset(0) }}>{['pending','contacted','approved','rejected','activated',''].map(s => <option key={s} value={s}>{s || 'All statuses'}</option>)}</select></label>
    <QueryState pending={q.isPending} error={q.error} retry={() => void q.refetch()} />
    {q.data && !q.error && <>{q.data.length === 0 ? <Empty title="No requests" /> : <div className="platform-table"><table><thead><tr><th>Shop / submitted</th><th>Contact</th><th>Status</th><th>Approved account</th><th>Review</th></tr></thead><tbody>{q.data.map(r => <tr key={r.id}><td><strong>{r.shop_name}</strong><small>{date(r.created_at)}</small><small>{r.local_shop_id}</small><small>{r.channel === 'web' ? (r.request_kind === 'new_cloud' ? 'Web · new cloud shop' : 'Web · existing Android shop') : 'Android'}</small><small>{r.requested_email}</small></td><td>{r.contact_name}<small><a href={`tel:${r.phone}`}>{r.phone}</a></small><small>Consent: {date(r.consent_at)}</small></td><td><Status value={r.status} /></td><td>{r.approved_email || '—'}<small>{date(r.starts_at)} → {date(r.ends_at)}</small></td><td>{!['rejected','activated'].includes(r.status) ? <Button onClick={() => setSelected(r)}>Review {r.shop_name}</Button> : 'Closed'}</td></tr>)}</tbody></table></div>}<Pager offset={offset} setOffset={setOffset} more={q.data.length === PAGE} /></>}
    {selected && <Review key={selected.id} row={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); void refresh() }} />}
  </>
}
function Review({ row, onClose, onSaved }: { row: PremiumRequest; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<'contacted' | 'approved' | 'rejected'>(row.status === 'approved' ? 'approved' : 'contacted')
  const [email, setEmail] = useState(row.requested_email ?? row.approved_email ?? '')
  const [start, setStart] = useState(() => localDate(row.starts_at ?? new Date().toISOString()))
  const [end, setEnd] = useState(() => localDate(row.ends_at ?? new Date(Date.now()+30*86400000).toISOString()))
  const [reason, setReason] = useState('')
  const { busy, error, run } = useAction()
  async function submit(e: FormEvent) {
    e.preventDefault()
    const body: Schemas['ReviewIn'] = { status, expected_revision: row.revision, reason: reason.trim(), ...(status === 'approved' ? { approved_email: email.trim(), starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString() } : {}) }
    const saved = await run(() => request<Schemas['RequestOut']>('PUT', `/v1/platform/premium-requests/${row.id}`, { body }))
    if (saved) onSaved()
  }
  return <Modal title={`Review ${row.shop_name}`} onClose={onClose} canClose={!busy}><form onSubmit={submit}>{error && <Alert>{error} Reload the queue before retrying a changed request.</Alert>}<p>{row.contact_name} · {row.phone}</p><label>Decision <select value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="contacted">Contacted</option><option value="approved">Approve</option><option value="rejected">Reject</option></select></label>
    {status === 'approved' && <><Field label="Verified owner email" type="email" required readOnly={!!row.requested_email} value={email} onChange={e => setEmail(e.target.value)} hint="An existing verified account is required. The phone number is contact information only." /><Field label="Premium starts" type="datetime-local" required value={start} onChange={e => setStart(e.target.value)} /><Field label="Premium ends" type="datetime-local" min={start} required value={end} onChange={e => setEnd(e.target.value)} /><p>Approval does not upload data. {row.request_kind === 'new_cloud' ? 'The requesting account can explicitly activate a new empty cloud shop from the web.' : 'The approved owner must sign in and consent to backup/upload on the original phone.'}</p></>}
    <Field label="Reason" required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /><Button type="submit" variant="primary" disabled={busy || !reason.trim() || (status === 'approved' && (!email || !start || !end || end <= start))}>{busy ? 'Saving…' : 'Save review'}</Button></form></Modal>
}
