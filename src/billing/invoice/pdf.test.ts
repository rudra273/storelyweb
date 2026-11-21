import { expect, test } from 'vitest'
import { pdfFileName } from './pdf'

test('the file is named after the invoice number, safe for any system', () => {
  expect(pdfFileName('INV/2627/0209')).toBe('INV-2627-0209.pdf')
  expect(pdfFileName('CN/2627/0002')).toBe('CN-2627-0002.pdf')
  expect(pdfFileName('A 1\\2:3')).toBe('A-1-2-3.pdf')
  expect(pdfFileName('///')).toBe('invoice.pdf')
})
