import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api/client'
import type { AuditPage, ShopEvent } from '../../api/types'
import { when } from '../../components/format'
import { Alert, Empty, Loading } from '../../components/ui/ui'
import { PageHeader, Toolbar } from '../../components/ui/workspace'
import { describeError } from '../../components/useAction'
import { useDebounced } from '../../lib/useDebounced'
import { useShop } from '../../shops/context'

type Tab = 'business' | 'team'
const PAGE = 50

const ENTITY_OPTIONS = [
  { value: '', label: 'All areas' },
  { value: 'bill', label: 'Bills & returns' },
  { value: 'product', label: 'Products' },
  { value: 'stock', label: 'Stock adjustments' },
  { value: 'purchase', label: 'Purchases' },
  { value: 'supplier_payment', label: 'Supplier payments' },
  { value: 'expense', label: 'Expenses' },
  { value: 'customer', label: 'Customers' },
  { value: 'settings', label: 'Shop & invoice settings' },
]

const ENTITY_LABELS: Record<string, string> = Object.fromEntries(
  ENTITY_OPTIONS.filter(o => o.value).map(o => [o.value, o.label]),
)

export function ShopActivity() {
  const { current } = useShop()
  const shopId = current?.shop_id ?? ''
  const [tab, setTab] = useState<Tab>('business')
  const [entityType, setEntityType] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const q = useDebounced(search.trim(), 250)

  const auditParams = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE) })
  if (entityType) auditParams.set('entity_type', entityType)
  if (q) auditParams.set('q', q)

  const auditQuery = useQuery({
    queryKey: ['shop-audit', shopId, auditParams.toString()],
    queryFn: ({ signal }) => api.get<AuditPage>(`/v1/shops/${shopId}/audit-events?${auditParams}`, { signal }),
    enabled: !!shopId && tab === 'business',
  })

  const events = useQuery({
    queryKey: ['shop-events', shopId],
    queryFn: ({ signal }) => api.get<ShopEvent[]>(`/v1/shops/${shopId}/security-events`, { signal }),
    enabled: !!shopId && tab === 'team',
  })

  return (
    <div>
      <PageHeader
        eyebrow="WORKSPACE HISTORY"
        title="Shop activity"
        description="Business changes across bills, stock, purchases, expenses and settings, plus team access events."
      />
      <div role="tablist" aria-label="Activity views" className="settings-tabs" style={{ marginBottom: '1rem' }}>
        <button type="button" role="tab" aria-selected={tab === 'business'} className={tab === 'business' ? 'active' : undefined} onClick={() => setTab('business')}>Business changes</button>
        <button type="button" role="tab" aria-selected={tab === 'team'} className={tab === 'team' ? 'active' : undefined} onClick={() => setTab('team')}>Team & security</button>
      </div>

      {tab === 'business' && (
        <div>
          <Toolbar label="Filter business changes">
            <input type="search" aria-label="Search activity" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} placeholder="Search changes, actor or item" />
            <select aria-label="Area" value={entityType} onChange={e => { setEntityType(e.target.value); setPage(0) }}>
              {ENTITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Toolbar>
          {auditQuery.isPending && <Loading />}
          {auditQuery.error && <Alert>{describeError(auditQuery.error)} <button type="button" className="link" onClick={() => void auditQuery.refetch()}>Retry</button></Alert>}
          {auditQuery.data && auditQuery.data.items.length === 0 && (
            <Empty title={entityType || q ? 'No matching changes' : 'Nothing recorded yet'}>
              {entityType || q ? 'Try clearing the area filter or search text.' : 'Changes to bills, products, stock, purchases, expenses and settings will appear here.'}
            </Empty>
          )}
          {!!auditQuery.data?.items.length && (
            <>
              <div className="table-wrap"><table className="table">
                <thead><tr><th>When</th><th>Area</th><th>Action</th><th>Details</th><th>By</th></tr></thead>
                <tbody>
                  {auditQuery.data.items.map(e => (
                    <tr key={e.uuid}>
                      <td>{when(e.created_at)}</td>
                      <td>{ENTITY_LABELS[e.entity_type] ?? e.entity_type}</td>
                      <td>{e.action.replaceAll('_', ' ')}</td>
                      <td>{e.details || '—'}</td>
                      <td>{e.actor || e.device_id || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              {(page > 0 || auditQuery.data.has_more) && (
                <div className="pager">
                  <button type="button" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</button>
                  <button type="button" disabled={!auditQuery.data.has_more} onClick={() => setPage(p => p + 1)}>Next</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'team' && (
        <div>
          {events.isPending && <Loading />}
          {events.error && <Alert>{describeError(events.error)} <button type="button" className="link" onClick={() => void events.refetch()}>Retry activity</button></Alert>}
          {events.data?.length === 0 && <Empty title="Nothing yet" />}
          {!!events.data?.length && (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>When</th><th>Event</th></tr></thead>
              <tbody>
                {events.data.map(e => (
                  <tr key={e.id}><td>{when(e.created_at)}</td><td>{e.event.replaceAll('_', ' ')}</td></tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      )}
    </div>
  )
}
