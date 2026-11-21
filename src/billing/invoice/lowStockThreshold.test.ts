import { expect, test } from 'vitest'
import type { InvoiceSettings } from '../queries'
import { lowStockThresholdProblem } from './lowStockThreshold'

const base = { low_stock_threshold: '5' } as InvoiceSettings
for (const value of ['0', '0.0000', '000.00000', '9.9999', '10.00000', '999999999', '999999999.00000', '00010.12340000', ' \t10.0001\r\n']) {
  test(`threshold accepts exact bounded plain decimal ${JSON.stringify(value)}`, () => expect(lowStockThresholdProblem(base, { ...base, low_stock_threshold: value })).toBeUndefined())
}
for (const value of ['', ' ', '+5', '-0', '-1', '.25', '18.', '1e1', 'NaN', 'Infinity', '9.99999', '999999999.0001', '1000000000', '1,000', '١٠', '\u00a010\u00a0', '10\u000b']) {
  test(`threshold refuses ${JSON.stringify(value)} without rewriting it`, () => expect(lowStockThresholdProblem(base, { ...base, low_stock_threshold: value })).toContain('four decimal places'))
}

test('untouched legacy threshold stays opaque even outside the new UI write grammar', () => {
  const legacy = { ...base, low_stock_threshold: '5.123456789012345678' }
  expect(lowStockThresholdProblem(legacy, { ...legacy })).toBeUndefined()
})
