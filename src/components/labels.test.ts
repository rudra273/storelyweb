import { expect, test } from 'vitest'
import { paymentMethod } from './labels'

test.each(['bank', 'bank_transfer'])('historical %s payment uses the shared bank display identity', code => {
  expect(paymentMethod(code)).toBe('Bank transfer')
})

test('payment labels preserve missing and unfamiliar methods without interpreting them as bank', () => {
  expect(paymentMethod(null)).toBe('—')
  expect(paymentMethod('cash')).toBe('Cash')
  expect(paymentMethod('future_method')).toBe('Future method')
})
