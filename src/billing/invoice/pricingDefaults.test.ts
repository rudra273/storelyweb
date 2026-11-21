import { expect, test } from 'vitest'
import type { InvoiceSettings } from '../queries'
import { pricingSettingsProblems } from './pricingDefaults'

const base = { default_gst_percent: '18', default_profit_margin_percent: '0', default_overhead_cost: '0.00' } as InvoiceSettings

for (const [key, values] of [
  ['default_gst_percent', ['0', '0.2500', '.25', '+5', '18.', '-0', '3', '5', '12', '18.000', '28', '40']],
  ['default_profit_margin_percent', ['0', '100', '100.0000', '12.345', '0012.34500', '0.001', '1e1', '12.345e0', '-0.000e9']],
  ['default_overhead_cost', ['0', '999999999', '999999999.00', '12.3400', '0.01', '.01', '+12.34', '1234e-2']],
] as const) {
  for (const value of values) test(`valid edited ${key} ${value} matches exact write bounds`, () => {
    expect(pricingSettingsProblems(base, { ...base, [key]: value })).toEqual({})
  })
}
for (const [key, values] of [
  ['default_gst_percent', ['', '7', 'NaN', '1e1', '-1']],
  ['default_profit_margin_percent', ['', '-1', '100.001', '1.2345', '0.0001', 'NaN', 'Infinity', '1e999', '1e-999', '1,25']],
  ['default_overhead_cost', ['', '-0.01', '999999999.01', '1000000000', '0.001', 'NaN', '1e999', '1e-999', '1,000']],
] as const) {
  for (const value of values) test(`invalid edited ${key} ${value} is not rounded or clamped`, () => {
    expect(pricingSettingsProblems(base, { ...base, [key]: value })).toHaveProperty(key)
  })
}

test('untouched legacy precision and unsupported defaults are not reinterpreted', () => {
  const legacy = { ...base, default_gst_percent: '7.123456789012345678', default_profit_margin_percent: '-1.123456789012345678', default_overhead_cost: '100000000000000000.123456789012345678' }
  expect(pricingSettingsProblems(legacy, { ...legacy })).toEqual({})
})
