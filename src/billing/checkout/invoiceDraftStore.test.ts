import { afterEach, expect, test, vi } from 'vitest'
import { openInvoiceDraft } from './invoiceDraftStore'

const key = 'storely.draft.bill.u1.s1'
const attempt = { key: 'operation-123', body: { amount: '12.50' } }
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

test('legacy uncertain operations survive age and reopen with the exact request', () => {
  localStorage.setItem(key, JSON.stringify({ v: 1, savedAt: Date.now() - 9 * 86400000, data: { attempt } }))
  const store = openInvoiceDraft<{ attempt: typeof attempt }>('u1', 's1')
  expect(store.initial?.data.attempt).toEqual(attempt)
  store.save(store.initial!.data)
  expect(openInvoiceDraft('u1', 's1').initial?.data.attempt).toEqual(attempt)
  expect(openInvoiceDraft('u2', 's1').initial).toBeNull()
})

test('storage rejection preserves the previous editable draft', () => {
  const store = openInvoiceDraft('u1', 's1')
  store.save({ attempt: null })
  const previous = localStorage.getItem(key)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Quota', 'QuotaExceededError') })
  expect(() => store.save({ attempt })).toThrow(/not been sent/)
  expect(localStorage.getItem(key)).toBe(previous)
})

test('another tab cannot overwrite or clear the frozen request', () => {
  const first = openInvoiceDraft('u1', 's1')
  const second = openInvoiceDraft('u1', 's1')
  first.save({ attempt })
  expect(() => second.save({ attempt: null })).toThrow(/another tab/)
  expect(() => second.clear()).toThrow(/another tab/)
  expect(openInvoiceDraft('u1', 's1').initial?.data.attempt).toEqual(attempt)
})

test('failed readback prevents treating a write as durable', () => {
  const store = openInvoiceDraft('u1', 's1')
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
  expect(() => store.save({ attempt })).toThrow(/another tab/)
})

test('an unreadable record blocks replacement instead of dropping a possible operation', () => {
  localStorage.setItem(key, '{broken')
  const store = openInvoiceDraft('u1', 's1')
  expect(store.initialError?.kind).toBe('unreadable')
  expect(() => store.save({ attempt: null })).toThrow(/could not be read/)
  expect(localStorage.getItem(key)).toBe('{broken')
})
