import { expect, test } from 'vitest'
import { findSettings } from './settingsSearch'

test('settings labels and aliases use trimmed case-insensitive literal substring matching', () => {
  expect(findSettings('  PrOfIt MaRgIn  ').map(entry => entry.id)).toEqual(['tax'])
  expect(findSettings('thermal').map(entry => entry.id)).toEqual(['printing'])
  expect(findSettings('reorder').map(entry => entry.id)).toEqual(['stock'])
  expect(findSettings('HSN').map(entry => entry.id)).toEqual(['visibility'])
  expect(findSettings('printer').map(entry => entry.id)).toEqual(['printing'])
  expect(findSettings('GST scheme').map(entry => entry.id)).toEqual(['tax'])
  expect(findSettings('invoice layout').map(entry => entry.id)).toEqual(['invoice'])
  expect(findSettings('UPI').map(entry => entry.id)).toEqual(['invoice'])
  for (const query of ['', '   ', '.*', '%', '_', '[', 'customer-secret-value']) expect(findSettings(query)).toEqual([])
})
