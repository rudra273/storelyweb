import type { components } from '../api/schema'

type S = components['schemas']

/** The most products a bulk change or a label run takes at once (the server enforces it too). */
export const BULK_LIMIT = 1000

/** What the catalogue is filtered by. A selection belongs to one set of filters. */
export interface Filters { q: string; category: string; low: boolean; expiring: boolean }

/**
 * Which products are chosen:
 *  - `picked`: these products, possibly from several pages;
 *  - `matching`: every product the filters matched when "select all" was chosen. The filters are
 *    frozen in it, and the server resolves them again when the change is reviewed or applied.
 * Either one is only valid for the filters it was made under (`key`).
 */
export type Selection =
  | { kind: 'none' }
  | { kind: 'picked'; ids: string[]; key: string }
  | { kind: 'matching'; filters: Filters; total: number; key: string }

export const NONE: Selection = { kind: 'none' }

export const filterKey = (f: Filters): string => JSON.stringify([f.q, f.category, f.low, f.expiring])

export function selectedCount(s: Selection): number {
  return s.kind === 'picked' ? s.ids.length : s.kind === 'matching' ? s.total : 0
}

/** The selection as the API names it: the products picked, or the filter they matched. */
export function scopeOf(s: Selection): S['BulkScope'] {
  if (s.kind === 'picked') return { ids: s.ids }
  if (s.kind === 'matching') {
    const f = s.filters
    return { filter: { q: f.q || null, category: f.category || null, low_stock: f.low, expiring_days: f.expiring ? 30 : null } }
  }
  return { ids: [] }
}

/** The same selection seen from the current filters: valid as is, or empty if the filters moved on. */
export function liveSelection(s: Selection, filters: Filters): Selection {
  return s.kind !== 'none' && s.key === filterKey(filters) ? s : NONE
}

/** Header checkbox: none, some or all of the visible rows are selected. */
export function pageState(s: Selection, visible: string[]): 'none' | 'some' | 'all' {
  if (s.kind === 'matching') return 'all'
  if (s.kind !== 'picked' || visible.length === 0) return 'none'
  const on = visible.filter(id => s.ids.includes(id)).length
  return on === 0 ? 'none' : on === visible.length ? 'all' : 'some'
}

/** Ticking the header adds this page; ticking it again takes this page off (other pages stay chosen). */
export function togglePage(s: Selection, visible: string[], filters: Filters): Selection {
  const key = filterKey(filters)
  const current = s.kind === 'picked' && s.key === key ? s.ids : []
  const all = visible.length > 0 && visible.every(id => current.includes(id))
  const ids = all ? current.filter(id => !visible.includes(id)) : [...new Set([...current, ...visible])]
  return ids.length ? { kind: 'picked', ids, key } : NONE
}

export function toggleOne(s: Selection, id: string, filters: Filters): Selection {
  const key = filterKey(filters)
  const current = s.kind === 'picked' && s.key === key ? s.ids : []
  const ids = current.includes(id) ? current.filter(x => x !== id) : [...current, id]
  return ids.length ? { kind: 'picked', ids, key } : NONE
}

export function selectAllMatching(filters: Filters, total: number): Selection {
  return { kind: 'matching', filters, total, key: filterKey(filters) }
}
