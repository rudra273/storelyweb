import { expect, test } from 'vitest'
import { isDay, localDay, parsePreset, rangeFor } from './periods'

const now = new Date(2026, 9, 25, 23, 59) // 25 Oct 2026, a minute before midnight

test('presets are local calendar days, even late in the evening', () => {
  expect(rangeFor('today', now)).toEqual({ from: '2026-10-25', to: '2026-10-25' })
  expect(rangeFor('yesterday', now)).toEqual({ from: '2026-10-24', to: '2026-10-24' })
  expect(rangeFor('week', now)).toEqual({ from: '2026-10-19', to: '2026-10-25' })
  expect(rangeFor('month', now)).toEqual({ from: '2026-10-01', to: '2026-10-25' })
  expect(rangeFor('year', now)).toEqual({ from: '2026-01-01', to: '2026-10-25' })
  expect(rangeFor('custom', now)).toBeNull()
})

test('last month handles month and year boundaries and leap years', () => {
  expect(rangeFor('lastmonth', now)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  expect(rangeFor('lastmonth', new Date(2027, 0, 5))).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  expect(rangeFor('lastmonth', new Date(2028, 2, 10))).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  expect(rangeFor('yesterday', new Date(2026, 2, 1))).toEqual({ from: '2026-02-28', to: '2026-02-28' })
})

test('days are checked as real calendar dates', () => {
  expect(isDay('2026-02-28')).toBe(true)
  for (const bad of ['2026-02-30', '2026-13-01', '26-01-01', '', null, undefined, "2026-01-01'; --"]) {
    expect(isDay(bad)).toBe(false)
  }
  expect(localDay(new Date(2026, 0, 5))).toBe('2026-01-05')
})

test('an unknown preset falls back to this month', () => {
  expect(parsePreset('bogus')).toBe('month')
  expect(parsePreset('today')).toBe('today')
  expect(parsePreset(null)).toBe('month')
})
