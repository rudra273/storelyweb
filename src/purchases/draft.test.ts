import { afterEach, expect, test } from 'vitest'
import { amountInCents, centsText, draftError, draftKey, newDraft, readDraft, subtotal, todayInShop, toInput, type DraftLine } from './draft'

afterEach(() => localStorage.clear())
const line = (changes: Partial<DraftLine> = {}): DraftLine => ({ id: 'line1', product_uuid: 'p1', name: 'Tea', unit: 'kg', quantity: '2.5', unit_cost: '1.2345', batch_no: '', expiry_date: '', ...changes })

test('decimal totals use exact half-up per-line rounding', () => {
  expect(centsText(amountInCents('2.5', '1.2345')!)).toBe('3.09')
  expect(centsText(amountInCents('1', '0.005')!)).toBe('0.01')
  expect(centsText(amountInCents('9999999999.9999', '9999999999.9999')!)).toBe('99999999999998000000.00')
  const draft = { ...newDraft(), items: [line({ quantity: '1', unit_cost: '0.005' }), line({ quantity: '1', unit_cost: '0.005' })] }
  expect(subtotal(draft)).toBe('0.02')
})

test('reject invalid numbers and calendar dates instead of submitting partial totals', () => {
  for (const input of ['-1', '1e3', 'NaN', '', '1.00001']) expect(amountInCents(input, '1')).toBeNull()
  expect(amountInCents('0', '1')).toBeNull()
  expect(amountInCents('1', '0')).toBe(0n)
  const draft = { ...newDraft(), items: [line({ expiry_date: '2026-02-30' })] }
  expect(draftError(draft)).toContain('expiry date')
  expect(subtotal({ ...draft, items: [line({ quantity: '' })] })).toBeNull()
})

test('dates use shop time around the UTC day boundary', () => {
  expect(todayInShop(new Date('2026-10-28T20:00:00Z'))).toBe('2026-10-29')
})

test('draft recovery retains exact frozen request and isolates accounts and shops', () => {
  const key = draftKey('u1', 's1')
  const draft = { ...newDraft(), items: [line()] }
  draft.submitted = toInput(draft)
  localStorage.setItem(key, JSON.stringify(draft))
  expect(readDraft(key).draft).toEqual(draft)
  expect(readDraft(draftKey('u2', 's1')).draft.items).toEqual([])
  expect(readDraft(draftKey('u1', 's2')).draft.items).toEqual([])
  expect(readDraft(key).draft.submitted?.request_key).toBe(draft.request_key)
})

test('corrupt saved data is preserved for explicit recovery', () => {
  const key = draftKey('u1', 's1')
  localStorage.setItem(key, '{broken')
  expect(readDraft(key).error).toContain('could not be read')
  expect(localStorage.getItem(key)).toBe('{broken')
})

test('receipt amounts display exact large values and four-place unit costs', async () => {
  const { receiptMoney } = await import('./money')
  expect(receiptMoney('99999999999998000000.01')).toBe('₹9,99,99,99,99,99,99,80,00,000.01')
  expect(receiptMoney('18.2555')).toBe('₹18.2555')
})
