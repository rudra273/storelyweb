import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api/client'
import { when } from '../../components/format'
import { stockReason } from '../../components/labels'
import { Modal } from '../../components/ui/Modal'
import { Alert, Empty, Loading } from '../../components/ui/ui'
import { Toolbar } from '../../components/ui/workspace'
import { describeError } from '../../components/useAction'
import { formatQty } from '../../lib/money'
import { useDebounced } from '../../lib/useDebounced'
import { useShop } from '../../shops/context'

interface StockLedgerItem {
  uuid: string
  product_uuid: string
  product_name: string
  movement_type: string
  quantity_delta: string
  balance_after: string
  reason: string | null
  unit_cost?: string | null
  source_document_type: string | null
  source_document_uuid: string | null
  created_at: string
}

interface StockLedgerPage {
  items: StockLedgerItem[]
  next_cursor: string | null
}

const MOVEMENT_TYPES = [
  { value: '', label: 'All types' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'sale', label: 'Sale' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'return', label: 'Return' },
  { value: 'void', label: 'Void' },
  { value: 'stocktake', label: 'Stocktake' },
] as const

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  MOVEMENT_TYPES.filter(o => o.value).map(o => [o.value, o.label]),
)

function formatDelta(raw: string): string {
  const n = Number(raw)
  if (Number.isNaN(n)) return raw
  if (n > 0) return `+${formatQty(raw)}`
  return formatQty(raw)
}

export function ShopStockLedger({ onClose }: { onClose: () => void }) {
  const shopId = useShop().current?.shop_id ?? ''
  const [search, setSearch] = useState('')
  const [movementType, setMovementType] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [pageIndex, setPageIndex] = useState(0)
  const q = useDebounced(search.trim(), 250)

  const resetPaging = () => {
    setCursors([null])
    setPageIndex(0)
  }

  const cursor = cursors[pageIndex] ?? null
  const params = new URLSearchParams({ limit: '25' })
  if (q) params.set('q', q)
  if (movementType) params.set('type', movementType)
  if (fromDate) params.set('from', fromDate)
  if (toDate) params.set('to', toDate)
  if (cursor) params.set('cursor', cursor)

  const query = useQuery({
    queryKey: ['shop-stock-ledger', shopId, params.toString()],
    queryFn: ({ signal }) => api.get<StockLedgerPage>(`/v1/shops/${shopId}/stock-movements?${params}`, { signal }),
    enabled: !!shopId,
  })

  const filtered = !!(q || movementType || fromDate || toDate)
  const items = query.data?.items ?? []

  return (
    <Modal title="Stock ledger" wide onClose={onClose}>
      <Toolbar label="Filter stock movements">
        <input
          type="search"
          aria-label="Search stock ledger"
          placeholder="Search product name or code"
          value={search}
          onChange={e => { setSearch(e.target.value); resetPaging() }}
        />
        <select
          aria-label="Movement type"
          value={movementType}
          onChange={e => { setMovementType(e.target.value); resetPaging() }}
        >
          {MOVEMENT_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label>
          From
          <input
            type="date"
            aria-label="From"
            value={fromDate}
            onChange={e => { setFromDate(e.target.value); resetPaging() }}
          />
        </label>
        <label>
          To
          <input
            type="date"
            aria-label="To"
            value={toDate}
            onChange={e => { setToDate(e.target.value); resetPaging() }}
          />
        </label>
        {filtered && (
          <button
            type="button"
            className="link"
            onClick={() => {
              setSearch('')
              setMovementType('')
              setFromDate('')
              setToDate('')
              resetPaging()
            }}
          >
            Clear filters
          </button>
        )}
      </Toolbar>

      {query.isPending && <Loading label="Loading stock ledger…" />}
      {query.error && (
        <Alert>
          {describeError(query.error)}{' '}
          <button type="button" className="link" onClick={() => void query.refetch()}>Retry</button>
        </Alert>
      )}
      {query.data && items.length === 0 && (
        <Empty title={filtered ? 'No matching stock movements' : 'No stock movements yet'}>
          {filtered
            ? 'Try clearing the filters or expanding the date range.'
            : 'Purchases, sales, returns and stock adjustments will appear here.'}
        </Empty>
      )}
      {items.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Product</th>
                  <th>Type</th>
                  <th className="num">Change</th>
                  <th className="num">Balance</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.uuid}>
                    <td>{when(item.created_at)}</td>
                    <td>{item.product_name}</td>
                    <td>{TYPE_LABELS[item.movement_type] ?? item.movement_type}</td>
                    <td className="num">{formatDelta(item.quantity_delta)}</td>
                    <td className="num">{formatQty(item.balance_after)}</td>
                    <td>{stockReason(item.reason) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(pageIndex > 0 || query.data?.next_cursor) && (
            <div className="pager">
              <button
                type="button"
                disabled={pageIndex === 0}
                onClick={() => setPageIndex(p => Math.max(0, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!query.data?.next_cursor}
                onClick={() => {
                  const nextCursor = query.data?.next_cursor
                  if (!nextCursor) return
                  setCursors(prev => {
                    const copy = prev.slice(0, pageIndex + 1)
                    copy.push(nextCursor)
                    return copy
                  })
                  setPageIndex(p => p + 1)
                }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
