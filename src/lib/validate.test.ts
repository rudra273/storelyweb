import { expect, test } from 'vitest'
import { amountProblem, emailProblem, gstinProblem, phoneLabel, phoneProblem } from './validate'

test('phone numbers follow the phone app', () => {
  expect(phoneProblem('')).toBeNull()
  expect(phoneProblem('', true)).toBe('Enter a phone number.')
  expect(phoneProblem('98765 43210')).toBeNull()
  expect(phoneProblem('+91 98765-43210')).toBeNull()
  expect(phoneProblem('12345')).toBe('Enter a 10-digit mobile number.')
  expect(phoneLabel('919876543210')).toBe('+91 98765 43210')
  expect(phoneLabel(null)).toBe('—')
})

test('GSTIN and email are checked only when given', () => {
  expect(gstinProblem('')).toBeNull()
  expect(gstinProblem('27abcde1234f1z5')).toBeNull()
  expect(gstinProblem('27ABCDE1234')).toMatch(/15 characters/)
  expect(gstinProblem('ABCDE12341234Z5')).toMatch(/right format/)
  expect(emailProblem('')).toBeNull()
  expect(emailProblem('a@b.co')).toBeNull()
  expect(emailProblem('nope')).toMatch(/name@example.com/)
})

test('amounts are positive rupees with two decimals at most', () => {
  expect(amountProblem('')).toBe('Enter an amount.')
  expect(amountProblem('0')).toBe('Enter an amount above zero.')
  expect(amountProblem('10.555')).toMatch(/two decimals/)
  expect(amountProblem('-5')).toMatch(/two decimals/)
  expect(amountProblem('99.5')).toBeNull()
  expect(amountProblem('101', { max: 100 })).toBe('This is more than the ₹100.00 due.')
})

test('shop phone and UPI id', async () => {
  const { shopPhoneProblem, upiProblem } = await import('./validate')
  expect(shopPhoneProblem('020-2553 1234')).toBeNull()
  expect(shopPhoneProblem('12345')).toMatch(/10 digits/)
  expect(upiProblem('shop@okaxis')).toBeNull()
  expect(upiProblem('shop')).toMatch(/shopname@okaxis/)
})
