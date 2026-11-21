import { afterEach, expect, test, vi } from 'vitest'
import { clearAllDrafts, clearDraft, loadDraft, saveDraft } from './drafts'

afterEach(() => vi.useRealTimers())

test('a draft belongs to one person and one shop', () => {
  saveDraft('bill', 'u1', 's1', { n: 1 })
  expect(loadDraft('bill', 'u1', 's1')?.data).toEqual({ n: 1 })
  expect(loadDraft('bill', 'u2', 's1')).toBeNull()
  expect(loadDraft('bill', 'u1', 's2')).toBeNull()
})

test('an old or unreadable draft is dropped', () => {
  vi.useFakeTimers()
  saveDraft('bill', 'u1', 's1', { n: 1 })
  vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000)
  expect(loadDraft('bill', 'u1', 's1')).toBeNull()
  expect(localStorage.length).toBe(0)
  localStorage.setItem('storely.draft.bill.u1.s1', '{not json')
  expect(loadDraft('bill', 'u1', 's1')).toBeNull()
})

test('clearing removes drafts but leaves other settings', () => {
  localStorage.setItem('storely.shop', 's1')
  saveDraft('bill', 'u1', 's1', {})
  saveDraft('bill', 'u1', 's2', {})
  clearDraft('bill', 'u1', 's1')
  expect(loadDraft('bill', 'u1', 's1')).toBeNull()
  expect(loadDraft('bill', 'u1', 's2')).not.toBeNull()
  localStorage.setItem('storely.supplier-payment:u1:s1:supplier:purchase', 'pending')
  clearAllDrafts()
  expect(localStorage.getItem('storely.supplier-payment:u1:s1:supplier:purchase')).toBeNull()
  expect(loadDraft('bill', 'u1', 's2')).toBeNull()
  expect(localStorage.getItem('storely.shop')).toBe('s1')
})
