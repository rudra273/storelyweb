import { expect, test } from 'vitest'
import { paymentStatus } from '../components/labels'
import { NAV_GROUPS } from '../navigation'
import { ACTION, PAYMENT_STATUS } from './vocabulary'

test('payment states use one vocabulary everywhere', () => {
  expect(PAYMENT_STATUS).toMatchObject({ paid: 'Paid', partial: 'Partially paid', unpaid: 'Unpaid' })
  expect(paymentStatus('partial')).toBe('Partially paid')
  expect(paymentStatus('something_new')).toBe('Something new')
})

test('editing says Save changes and leaving an editor says Cancel', () => {
  expect(ACTION).toEqual({ saveChanges: 'Save changes', cancel: 'Cancel', close: 'Close' })
})

test('every destination has one label and one address', () => {
  const items = NAV_GROUPS.flatMap(g => g.items)
  expect(new Set(items.map(i => i.to)).size).toBe(items.length)
  expect(new Set(items.map(i => i.label)).size).toBe(items.length)
  // Sentence case: only the first letter is capitalised.
  expect(items.every(i => /^[A-Z][^A-Z]*$/.test(i.label))).toBe(true)
})
