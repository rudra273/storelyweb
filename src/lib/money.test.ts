import { expect, test } from 'vitest'
import { decimalOrNull, formatMoney, formatQty, isAmount } from './money'

test('money is shown in rupees with Indian grouping and never throws on odd input', () => {
  expect(formatMoney('125000.5')).toBe('₹1,25,000.50')
  expect(formatMoney('25.5')).toBe('₹25.50')
  expect(formatMoney(null)).toBe('—')
  expect(formatMoney('')).toBe('—')
  expect(formatMoney('abc')).toBe('—')
})

test('quantities keep their decimals but drop trailing zeros', () => {
  expect(formatQty('12.5')).toBe('12.5')
  expect(formatQty('50')).toBe('50')
  expect(formatQty(undefined)).toBe('—')
})

test('form text to API values', () => {
  expect(decimalOrNull('  ')).toBeNull()
  expect(decimalOrNull(' 4.5 ')).toBe('4.5')
  expect(['0', '12', '12.5', '0.0001'].every(isAmount)).toBe(true)
  expect(['', '-1', '1e5', '1,000', '.5', '1.12345', 'x'].some(isAmount)).toBe(false)
})
