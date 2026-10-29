import { QueryState, Pager } from './Bits'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Empty, Field } from '../components/ui'
import { Button, PageHeader } from '../components/workspace'
import { date, PAGE, usePlatform, type Schemas } from './shared'

export function PlatformHistory() {
  const [params, setParams] = useSearchParams()
  const [offset, setOffset] = useState(0)
  const shop = params.get('shop_id') || ''
  const q = usePlatform<Schemas['PlatformHistoryOut']>(`/history?${new URLSearchParams({ ...(shop ? { shop_id: shop } : {}), limit: String(PAGE), offset: String(offset) })}`)
  return <><PageHeader eyebrow="DEVELOPER CONSOLE" title="Audit history" description="Append-only subscription and request decisions, with actor, reason and state changes." actions={<Button onClick={() => void q.refetch()}>Refresh</Button>} /><Field label="Filter by exact shop ID" maxLength={64} value={shop} onChange={e => { setParams(e.target.value ? { shop_id: e.target.value } : {}); setOffset(0) }} />
    <QueryState pending={q.isPending} error={q.error} retry={() => void q.refetch()} />
    {q.data && !q.error && <>{q.data.items.length === 0 ? <Empty title="No audit entries" /> : <div className="platform-table"><table><thead><tr><th>When / action</th><th>Shop / actor</th><th>Reason</th><th>Before → after</th></tr></thead><tbody>{q.data.items.map(e => <tr key={e.id}><td>{date(e.created_at)}<small>{e.action}</small><small>Event #{e.id}</small></td><td>{e.shop_id || 'Platform'}<small>Actor: {e.actor_id || 'Database operator / deleted account'}</small></td><td>{e.reason}</td><td>{[e.before_state, e.after_state].map((state,i) => <div key={i}><strong>{i === 0 ? 'Before' : 'After'}: {state.status || '—'}</strong><small>{date(state.starts_at)} → {date(state.ends_at)}</small><small>Revision {state.revision || '—'}{state.request_id ? ` · Request ${state.request_id}` : ''}</small></div>)}</td></tr>)}</tbody></table></div>}<Pager offset={offset} setOffset={setOffset} more={offset+PAGE < q.data.total} /></>}
  </>
}
