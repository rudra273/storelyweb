import { expect, test } from 'vitest'
import { saleQuantity } from './quantity'

test.each([
  ['1', '1'], [' 0001.2300 ', '1.23'], ['0.001000', '0.001'],
  ['1000000.0000', '1000000'], ['999999.999', '999999.999'], ['000.0100', '0.01'],
])('sale quantity normalizes %s as %s', (raw, expected) => expect(saleQuantity(raw)).toBe(expected))

test.each(['', ' ', '0', '0.0000', '-1', '+1', '.1', '1.', '1e2', 'NaN', 'Infinity', '1,000', '0.0001', '1.2341', '1000000.001', '1000001', '999999999999999999999999'])('sale quantity refuses %s', raw => expect(saleQuantity(raw)).toBeNull())
