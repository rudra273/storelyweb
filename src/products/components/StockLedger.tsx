import { useState } from 'react'
import { Link } from 'react-router'
import { stockReason } from '../../components/labels'
import { Modal } from '../../components/ui/Modal'
import { Alert, Empty, Loading } from '../../components/ui/ui'
import { Button } from '../../components/ui/workspace'
import { describeError } from '../../components/useAction'
import { formatMoney, formatQty } from '../../lib/money'
import { useLedger, type LedgerFilters } from '../queries'
import { LEDGER_FILTER_KINDS, MOVEMENT_KIND, movementTime, sourceTarget } from './ledgerLabels'

const NO_FILTER: LedgerFilters = { from: '', to: '', type: '' }

/**
 * Everything that ever changed this product's stock, newest first: what happened, who or what
 * it came from (with a link to the invoice or purchase), how much, and what was on the shelf
 * after. Filters narrow the list; the balances always stay the real ones.
 */
export function StockLedger({ id, name, unit, onClose }: { id: string; name: string; unit: string | null; onClose: () => void }) {
  const [filters, setFilters] = useState<LedgerFilters>(NO_FILTER)
  const ledger = useLedger(id, filters)
  const pages = ledger.data?.pages ?? []
  const entries = pages.flatMap(p => p.items)
  const total = pages[0]?.total ?? 0
  const onHand = pages[0]?.on_hand
  const filtered = !!(filters.from || filters.to || filters.type)
  const seeCost = entries.some(e => e.unit_cost !== undefined)
  const set = (key: keyof LedgerFilters) => (value: string) => setFilters(f => ({ ...f, [key]: value }))
  const badRange = !!filters.from && !!filters.to && filters.from > filters.to

  return <Modal title={`Stock history · ${name}`} onClose={onClose} wide>
    <p className="muted ledger-now">On the shelf now: <strong>{onHand === undefined || onHand === null ? '—' : `${formatQty(onHand)} ${unit ?? ''}`}</strong></p>
    <div className="ledger-filters" role="group" aria-label="Filter the history">
      <label>From<input type="date" value={filters.from} max={filters.to || undefined} onChange={e => set('from')(e.target.value)} /></label>
      <label>To<input type="date" value={filters.to} min={filters.from || undefined} onChange={e => set('to')(e.target.value)} /></label>
      <label>What happened<select value={filters.type} onChange={e => set('type')(e.target.value)}>
        <option value="">Everything</option>
        {LEDGER_FILTER_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
      </select></label>
      {filtered && <button type="button" className="link" onClick={() => setFilters(NO_FILTER)}>Clear filters</button>}
    </div>
    {badRange && <Alert kind="info">The “from” date is after the “to” date, so nothing can match.</Alert>}
    {ledger.isPending && <Loading />}
    {ledger.error && <Alert>{describeError(ledger.error)} <button className="link" onClick={() => void ledger.refetch()}>Retry history</button></Alert>}
    {ledger.data && entries.length === 0 && <Empty title={filtered ? 'Nothing matches these filters' : 'No stock movements yet'}>{filtered ? 'Try a wider range or clear the filters.' : 'Receive a purchase or adjust stock and it will be listed here.'}</Empty>}
    {entries.length > 0 && <>
      <div className="table-wrap"><table className="table ledger-table" aria-busy={ledger.isFetching}>
        <caption className="sr-only">Stock movements for {name}, newest first</caption>
        <thead><tr><th>When</th><th>What happened</th><th className="hide-sm">From</th><th className="num">Change</th><th className="num">On shelf after</th></tr></thead>
        <tbody>{entries.map(e => {
          const from = sourceTarget(e.source)
          const delta = Number(e.quantity_delta)
          return <tr key={e.uuid}>
            <td className="nowrap">{movementTime(e.created_at, e.type)}</td>
            <td>{MOVEMENT_KIND[e.type] ?? e.type}{e.reason ? ` · ${stockReason(e.reason)}` : ''}
              {(e.notes || e.batch_no || e.expiry_date || (seeCost && e.unit_cost)) && <small className="muted ledger-note">{[e.notes, e.batch_no && `batch ${e.batch_no}`, e.expiry_date && `expires ${e.expiry_date}`, seeCost && e.unit_cost ? `cost ${formatMoney(e.unit_cost)}` : null].filter(Boolean).join(' · ')}</small>}
              {from && <small className="show-sm muted">{from.label}</small>}</td>
            <td className="hide-sm nowrap">{from ? (from.to ? <Link to={from.to}>{from.label}</Link> : from.label) : <span className="muted">—</span>}</td>
            <td className={`num ${delta < 0 ? 'neg' : 'pos'}`}>{delta > 0 ? '+' : ''}{formatQty(e.quantity_delta)}</td>
            <td className="num">{formatQty(e.balance_after)}</td>
          </tr>
        })}</tbody>
      </table></div>
      <div className="pager">
        <span className="muted">Showing {entries.length.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')}</span>
        {ledger.hasNextPage && <Button onClick={() => void ledger.fetchNextPage()} disabled={ledger.isFetchingNextPage}>{ledger.isFetchingNextPage ? 'Loading…' : 'Show older entries'}</Button>}
      </div>
    </>}
    <div className="actions"><Button onClick={onClose}>Close</Button></div>
  </Modal>
}
