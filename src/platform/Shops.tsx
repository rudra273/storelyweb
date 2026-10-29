import { QueryState, Pager, Status } from './Bits'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { request } from '../api/client'
import { Modal } from '../components/Modal'
import { Alert, Empty, Field } from '../components/ui'
import { Button, PageHeader } from '../components/workspace'
import { useAction } from '../components/useAction'
import { useDebounced } from '../lib/useDebounced'
import { date, localDate, PAGE, usePlatform, useRefreshPlatform, type Schemas } from './shared'

type Shop = Schemas['PlatformShopOut']
export function PlatformShops() {
  const [search, setSearch] = useState('')
  const term = useDebounced(search, 250)
  const [status, setStatus] = useState('all')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<Shop | null>(null)
  const refresh = useRefreshPlatform()
  const q = usePlatform<Schemas['PlatformShopsOut']>(`/shops?${new URLSearchParams({ search: term, status, offset: String(offset), limit: String(PAGE) })}`)
  return <><PageHeader eyebrow="CLOUD REGISTRY" title="Shops" description="Registered shop metadata and subscription controls." actions={<Button onClick={() => void q.refetch()}>Refresh</Button>} /><div className="platform-filters"><Field label="Search shop name or ID" value={search} onChange={e => { setSearch(e.target.value); setOffset(0) }} maxLength={120} /><label>Subscription <select value={status} onChange={e => { setStatus(e.target.value); setOffset(0) }}>{['all','free','active','scheduled','expired','suspended'].map(s => <option key={s}>{s}</option>)}</select></label></div>
    <QueryState pending={q.isPending} error={q.error} retry={() => void q.refetch()} />
    {q.data && !q.error && <><p className="muted">{q.data.total} shops match</p>{q.data.items.length === 0 ? <Empty title="No matching shops" /> : <div className="platform-table"><table><thead><tr><th>Shop</th><th>Subscription</th><th>Premium interval</th><th>Cloud activity</th><th>Manage</th></tr></thead><tbody>{q.data.items.map(s => <tr key={s.shop_id}><td><strong>{s.name}</strong><small>{s.shop_id}</small><small>Registered {date(s.created_at)}</small></td><td><Status value={s.effective_status} /><small>Revision {s.revision}</small></td><td>{date(s.starts_at)}<small>to {date(s.ends_at)}</small></td><td>{s.device_count} devices<small>Last sync: {date(s.last_sync_at)}</small></td><td><Button onClick={() => setSelected(s)}>Manage {s.name}</Button><small><Link to={`/platform/history?shop_id=${encodeURIComponent(s.shop_id)}`}>Audit history</Link></small></td></tr>)}</tbody></table></div>}<Pager offset={offset} setOffset={setOffset} more={offset+PAGE < q.data.total} /></>}
    {selected && <Subscription key={selected.shop_id} row={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); void refresh() }} />}
  </>
}
function Subscription({ row, onClose, onSaved }: { row: Shop; onClose: () => void; onSaved: () => void }) {
  const [action, setAction] = useState('extend')
  const [start, setStart] = useState(() => localDate(row.starts_at ?? new Date().toISOString()))
  const [end, setEnd] = useState(() => localDate(row.ends_at ?? new Date(Date.now()+30*86400000).toISOString()))
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const { busy, error, run } = useAction()
  const status = action === 'suspend' ? 'suspended' : action === 'expire' ? 'expired' : 'active'
  async function submit(e: FormEvent) {
    e.preventDefault()
    const body: Schemas['SubscriptionChange'] = { status, starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(), expected_revision: row.revision, reason: reason.trim() }
    const saved = await run(() => request<Schemas['EntitlementOut']>('PUT', `/v1/platform/shops/${encodeURIComponent(row.shop_id)}/subscription`, { body }))
    if (saved) onSaved()
  }
  return <Modal title={`Subscription: ${row.name}`} onClose={onClose} canClose={!busy}><form onSubmit={submit}>{error && <Alert>{error} Reload the shop list before retrying a changed subscription.</Alert>}<p>Current status: <Status value={row.effective_status} /> · revision {row.revision}</p><label>Action <select value={action} onChange={e => { setAction(e.target.value); setConfirmed(false) }}><option value="extend">Grant / renew / extend</option><option value="resume">Resume</option><option value="suspend" disabled={row.plan === 'free'}>Suspend</option><option value="expire" disabled={row.plan === 'free'}>Expire now</option></select></label><Field label="Premium starts" type="datetime-local" required value={start} onChange={e => { setStart(e.target.value); setConfirmed(false) }} /><Field label="Premium ends" type="datetime-local" required min={start} value={end} onChange={e => { setEnd(e.target.value); setConfirmed(false) }} /><Field label="Reason" required maxLength={500} value={reason} onChange={e => { setReason(e.target.value); setConfirmed(false) }} /><p>Save sets this exact interval and status. Expire and suspend stop cloud access immediately. Local phone records are retained.</p><label className="check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm this subscription change for {row.name}.</label><Button type="submit" variant={status === 'active' ? 'primary' : 'danger'} disabled={busy || !confirmed || !reason.trim() || !start || !end || end <= start}>{busy ? 'Saving…' : 'Save subscription'}</Button></form></Modal>
}
