import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { openInvoiceDraft } from './invoiceDraftStore'

import { installInvoiceLocks } from './invoiceLocksTestSupport'

beforeEach(() => installInvoiceLocks())
const key = 'storely.draft.bill.u1.s1'
const attempt = { key: 'operation-123', body: { amount: '12.50' } }
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

test('legacy uncertain operations survive age and reopen with the exact request', async () => {
  localStorage.setItem(key, JSON.stringify({ v: 1, savedAt: Date.now() - 9 * 86400000, data: { attempt } }))
  const store = openInvoiceDraft<{ attempt: typeof attempt }>('u1', 's1')
  expect(store.initial?.data.attempt).toEqual(attempt)
  await store.save(store.initial!.data)
  expect(openInvoiceDraft('u1', 's1').initial?.data.attempt).toEqual(attempt)
  expect(openInvoiceDraft('u2', 's1').initial).toBeNull()
})

test('storage rejection preserves the previous editable draft', async () => {
  const store = openInvoiceDraft('u1', 's1')
  await store.save({ attempt: null })
  const previous = localStorage.getItem(key)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Quota', 'QuotaExceededError') })
  await expect(store.save({ attempt })).rejects.toThrow(/not been sent/)
  expect(localStorage.getItem(key)).toBe(previous)
})

test('another tab cannot overwrite or clear the frozen request', async () => {
  const first = openInvoiceDraft('u1', 's1')
  const second = openInvoiceDraft('u1', 's1')
  await first.save({ attempt })
  await expect(second.save({ attempt: null })).rejects.toThrow(/another tab/)
  await expect(second.clear()).rejects.toThrow(/another tab/)
  expect(openInvoiceDraft('u1', 's1').initial?.data.attempt).toEqual(attempt)
})

test('failed readback prevents treating a write as durable', async () => {
  const store = openInvoiceDraft('u1', 's1')
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
  await expect(store.save({ attempt })).rejects.toThrow(/another tab/)
})

test('an unreadable record blocks replacement instead of dropping a possible operation', async () => {
  localStorage.setItem(key, '{broken')
  const store = openInvoiceDraft('u1', 's1')
  expect(store.initialError?.kind).toBe('unreadable')
  await expect(store.save({ attempt: null })).rejects.toThrow(/could not be read/)
  expect(localStorage.getItem(key)).toBe('{broken')
})

test('simultaneous tab writers acquire one shared lock and only one freezes a new operation', async () => {
  const locks = installInvoiceLocks()
  let release!: () => void
  let entered!: () => void
  const ready = new Promise<void>(resolve => { entered = resolve })
  const held = locks.request(key, () => new Promise<void>(resolve => { release = resolve; entered() }))
  await ready
  const first = openInvoiceDraft('u1', 's1')
  const second = openInvoiceDraft('u1', 's1')
  const writes = [first.save({ attempt }), second.save({ attempt: { ...attempt, key: 'another-operation' } })]
  expect(localStorage.getItem(key)).toBeNull()
  release()
  await held
  const results = await Promise.allSettled(writes)
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
  expect(openInvoiceDraft('u1', 's1').initial?.data.attempt).toEqual(attempt)
})

test('unsupported Web Locks fail closed without persisting an unsafe operation', async () => {
  vi.stubGlobal('navigator', {})
  const store = openInvoiceDraft('u1', 's1')
  await expect(store.save({ attempt })).rejects.toThrow(/Web Locks on HTTPS or localhost/)
  expect(localStorage.getItem(key)).toBeNull()
})

test('a frozen request cannot be erased by a queued stale autosave from the same tab', async () => {
  const store = openInvoiceDraft('u1', 's1')
  await store.save({ attempt })
  await expect(store.save({ attempt: null })).rejects.toThrow(/previously unconfirmed/)
  await expect(store.clear()).rejects.toThrow(/previously unconfirmed/)
  expect(openInvoiceDraft('u1', 's1').initial?.data.attempt).toEqual(attempt)
  await store.save({ attempt: null }, { releaseAttempt: true })
  await store.clear()
  expect(localStorage.getItem(key)).toBeNull()
})

test('a denied browser lock produces an actionable recoverable storage error', async () => {
  vi.stubGlobal('navigator', { locks: { request: () => Promise.reject(new DOMException('Denied', 'SecurityError')) } })
  const store = openInvoiceDraft('u1', 's1')
  await expect(store.save({ attempt })).rejects.toMatchObject({ kind: 'storage', message: expect.stringContaining('could not acquire the invoice save lock') })
  expect(localStorage.getItem(key)).toBeNull()
})

test('a closed owner cannot repopulate cleared storage after its queued save acquires the lock', async () => {
  const locks = installInvoiceLocks()
  const store = openInvoiceDraft('u1', 's1')
  let release!: () => void
  let entered!: () => void
  const ready = new Promise<void>(resolve => { entered = resolve })
  const held = locks.request(key, () => new Promise<void>(resolve => { release = resolve; entered() }))
  await ready
  let active = true
  const write = store.save({ attempt }, { isActive: () => active })
  active = false // Checkout unmounted on sign-out before its queued work ran.
  release()
  await held
  await expect(write).rejects.toThrow(/checkout was closed/)
  expect(localStorage.getItem(key)).toBeNull()
})
