import { expect, test } from 'vitest'
import { paymentMinorUnits, validPartialPayment } from './settlement'

test('money comparisons retain exact minor units even beyond Number precision', () => {
  expect(paymentMinorUnits('9007199254740993.01')).toBe(900719925474099301n)
  expect(paymentMinorUnits(' 001.1 ')).toBe(110n)
  expect(validPartialPayment('999999998.99', '999999999')).toBe(true)
  expect(validPartialPayment('999999999.01', '1000000000')).toBe(false)
})

for (const amount of ['', 'x', '-1', '0', '0.00', '1e2', '1,00', '.5', '1.001', '189', '189.00', '190']) {
  test(`invalid partial amount ${JSON.stringify(amount)} is refused without rounding or clamping`, () => {
    expect(validPartialPayment(amount, '189.00')).toBe(false)
  })
}

test('valid partials stay strictly between zero and total, using exact cents', () => {
  expect(validPartialPayment('0.01', '0.02')).toBe(true)
  expect(validPartialPayment('188.99', '189.00')).toBe(true)
  expect(validPartialPayment('100', '189.00')).toBe(true)
  expect(validPartialPayment('1', 'bad')).toBe(false)
})
