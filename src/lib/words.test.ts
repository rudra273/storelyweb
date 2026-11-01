import { expect, test } from 'vitest'
import { amountInWords } from './words'

test('amounts read in the Indian system, from the decimal text', () => {
  expect(amountInWords('223.00')).toBe('Rupees Two Hundred Twenty Three Only')
  expect(amountInWords('1250075.50')).toBe('Rupees Twelve Lakh Fifty Thousand Seventy Five and Fifty Paise Only')
  expect(amountInWords('23400000.05')).toBe('Rupees Two Crore Thirty Four Lakh and Five Paise Only')
  expect(amountInWords('-59.00')).toBe('Minus Rupees Fifty Nine Only')
  expect(amountInWords('0.00')).toBe('Rupees Zero Only')
})
