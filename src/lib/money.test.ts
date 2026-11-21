import { describe, expect, it, test } from 'vitest'
import { changeToReturn, decimalOrNull, formatMoney, formatQty, isAmount } from './money'

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

describe('changeToReturn', () => {
  it('is the cash handed over beyond what is owed', () => {
    expect(changeToReturn('500', '437')).toBe('63.00')
    expect(changeToReturn('100.10', '99.95')).toBe('0.15')
  })
  it('is nothing when the cash covers exactly or falls short, or an amount is unusable', () => {
    expect(changeToReturn('437', '437')).toBeNull()
    expect(changeToReturn('400', '437')).toBeNull()
    expect(changeToReturn('abc', '437')).toBeNull()
  })
})
