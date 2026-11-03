import { expect, test } from 'vitest'
import { NONE, filterKey, liveSelection, pageState, scopeOf, selectAllMatching, selectedCount, toggleOne, togglePage, type Filters } from './selection'

const F: Filters = { q: '', category: '', low: false, expiring: false, noCode: false }
const rows = ['a', 'b', 'c']

test('the header checkbox is none, some or all of the visible rows', () => {
  expect(pageState(NONE, rows)).toBe('none')
  expect(pageState(toggleOne(NONE, 'a', F), rows)).toBe('some')
  expect(pageState(togglePage(NONE, rows, F), rows)).toBe('all')
  expect(pageState(selectAllMatching(F, 40), rows)).toBe('all')
})

test('ticking the header takes this page on and off, and other pages stay chosen', () => {
  const page1 = togglePage(NONE, rows, F)
  const both = togglePage(page1, ['d', 'e'], F)
  expect(selectedCount(both)).toBe(5)
  const off = togglePage(both, rows, F)
  expect(off).toMatchObject({ kind: 'picked', ids: ['d', 'e'] })
  expect(togglePage(off, ['d', 'e'], F)).toEqual(NONE)
})

test('a selection only counts under the filters it was made with', () => {
  const picked = toggleOne(NONE, 'a', F)
  expect(liveSelection(picked, F)).toBe(picked)
  expect(liveSelection(picked, { ...F, q: 'rice' })).toEqual(NONE)
  expect(filterKey(F)).not.toBe(filterKey({ ...F, low: true }))
})

test('the scope sent to the server is the picked products, or the frozen filter', () => {
  expect(scopeOf(toggleOne(NONE, 'a', F))).toEqual({ ids: ['a'] })
  const all = selectAllMatching({ q: 'soap', category: 'c1', low: true, expiring: true, noCode: true }, 12)
  expect(selectedCount(all)).toBe(12)
  expect(scopeOf(all)).toEqual({ filter: { q: 'soap', category: 'c1', low_stock: true, expiring_days: 30, no_code: true } })
  expect(scopeOf(selectAllMatching(F, 3))).toEqual({ filter: { q: null, category: null, low_stock: false, expiring_days: null, no_code: false } })
})
