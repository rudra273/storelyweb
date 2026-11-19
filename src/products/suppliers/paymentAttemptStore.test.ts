import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { openPaymentAttempt, type SupplierPaymentAttempt } from './paymentAttemptStore'
import { installInvoiceLocks } from '../../billing/checkout/invoiceLocksTestSupport'

const base = 'storely.supplier-payment:u1:s1:vendor1'
const payment: SupplierPaymentAttempt = { request_key: 'payment-key-123', payment_date: '2026-11-19', amount: '25.50', payment_method: 'cash', purchase_uuid: 'p2' }
beforeEach(() => installInvoiceLocks())
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('legacy selected purchase request restores under the supplier-wide reader without changing its target', async () => {
  localStorage.setItem(base + ':p2', JSON.stringify(payment))
  const store = openPaymentAttempt('u1', 's1', 'vendor1')
  expect(store.initial).toEqual(payment)
  await store.save(store.initial!, () => true)
  expect(JSON.parse(localStorage.getItem(base + ':p2')!)).toEqual(payment)
  expect(localStorage.getItem(base)).toBeNull()
})

test('two tabs cannot freeze different supplier payment intents', async () => {
  const first = openPaymentAttempt('u1', 's1', 'vendor1')
  const second = openPaymentAttempt('u1', 's1', 'vendor1')
  const results = await Promise.allSettled([first.save(payment, () => true), second.save({ ...payment, purchase_uuid: 'p1' }, () => true)])
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
  expect(JSON.parse(localStorage.getItem(base)!)).toEqual(payment)
})

test('unreadable or multiple legacy records fail closed and remain stored', async () => {
  localStorage.setItem(base, '{broken')
  const broken = openPaymentAttempt('u1', 's1', 'vendor1')
  await expect(broken.save(payment, () => true)).rejects.toMatchObject({ kind: 'unreadable' })
  expect(localStorage.getItem(base)).toBe('{broken')
  localStorage.setItem(base, JSON.stringify(payment))
  localStorage.setItem(base + ':p2', JSON.stringify(payment))
  const multiple = openPaymentAttempt('u1', 's1', 'vendor1')
  expect(multiple.initialError?.kind).toBe('unreadable')
  await expect(multiple.clear(() => true)).rejects.toThrow(/several unconfirmed/)
  expect(localStorage.length).toBe(2)
})

test('a dead editor cannot persist or clear a supplier request', async () => {
  const store = openPaymentAttempt('u1', 's1', 'vendor1')
  await expect(store.save(payment, () => false)).rejects.toThrow(/editor was closed/)
  expect(localStorage.getItem(base)).toBeNull()
  await store.save(payment, () => true)
  await expect(store.clear(() => false)).rejects.toThrow(/editor was closed/)
  expect(JSON.parse(localStorage.getItem(base)!)).toEqual(payment)
})

test('a silent storage write failure cannot pass the durability check', async () => {
  const store = openPaymentAttempt('u1', 's1', 'vendor1')
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
  await expect(store.save(payment, () => true)).rejects.toMatchObject({ kind: 'conflict' })
})
