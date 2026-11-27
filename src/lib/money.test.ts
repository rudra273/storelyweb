import { describe, expect, it, test } from 'vitest'
import { balanceAfter, changeToReturn, decimalOrNull, formatMoney, formatQty, isAmount, paiseToDecimal, toPaise } from './money'

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
  it('avoids binary floating-point drift on decimal edge cases and large values', () => {
    expect(changeToReturn('20.00', '19.99')).toBe('0.01')
    expect(changeToReturn('0.30', '0.10')).toBe('0.20')
    expect(balanceAfter('999999999.99', '0.01')).toBe('999999999.98')
    expect(balanceAfter('100000000.10', '0.09')).toBe('100000000.01')
  })
})

describe('exact BigInt paise helpers (D09)', () => {
  it('parses and formats binary-float edge cases without drift', () => {
    expect(toPaise('19.99')).toBe(1999n)
    expect(paiseToDecimal((toPaise('0.1') ?? 0n) + (toPaise('0.2') ?? 0n))).toBe('0.30')
    expect(toPaise('1.005')).toBe(101n)
    expect(toPaise('-1.005')).toBe(-101n)
    expect(paiseToDecimal(toPaise('999999999999.99')!)).toBe('999999999999.99')
    expect(paiseToDecimal(-5n)).toBe('-0.05')
    expect(toPaise('bad')).toBeNull()
    expect(toPaise(null)).toBeNull()
  })
})
