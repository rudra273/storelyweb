import { day } from '../../components/labels'
import { when } from '../../components/format'
import type { LedgerEntry } from '../queries'

export const MOVEMENT_KIND: Record<string, string> = {
  purchase: 'Stock in', sale: 'Sold', adjustment: 'Adjusted', return: 'Returned', void: 'Cancelled sale', stocktake: 'Stock count',
}

/** The kinds the ledger can be filtered by, in the words the history uses. */
export const LEDGER_FILTER_KINDS = Object.entries(MOVEMENT_KIND).map(([value, label]) => ({ value, label }))

/** A web purchase receipt has a date only (the server stamps it noon shop time), so show just the day for those. */
export function movementTime(createdAt: string, type: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}(T00:00(:00(\.0+)?)?Z?)?$/.test(createdAt) || (type === 'purchase' && createdAt.endsWith('T12:00:00+05:30'))
  return dateOnly ? day(createdAt) : when(createdAt)
}

/** Where a ledger entry came from, as a place in the app when there is one. */
export function sourceTarget(source: LedgerEntry['source']): { label: string; to: string | null } | null {
  if (!source) return null
  if (source.kind === 'bill' || source.kind === 'credit_note') return { label: source.label, to: `/billing/${source.uuid}` }
  if (source.kind === 'purchase') return { label: source.label, to: `/purchases/${source.uuid}` }
  return { label: source.label, to: null }
}
