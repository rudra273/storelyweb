import { expect, test } from 'vitest'
import { documentTitle } from './invoiceTitle'
import type { BillDetail, InvoiceSettings } from './queries'

const bill = (gst: string, type = 'invoice') => ({ cgst_amount: gst, sgst_amount: gst, igst_amount: '0.00', document_type: type }) as BillDetail['bill']
const settings = (scheme: string, title = 'TAX INVOICE') => ({ gst_scheme: scheme, invoice_title: title }) as InvoiceSettings

test('the title follows the phone: tax invoice with GST, else bill of supply or bill', () => {
  expect(documentTitle(settings('regular'), bill('9.00'))).toBe('TAX INVOICE')
  expect(documentTitle(settings('regular'), bill('0.00'))).toBe('BILL OF SUPPLY')
  expect(documentTitle(settings('composition'), bill('0.00'))).toBe('BILL OF SUPPLY')
  expect(documentTitle(settings('unregistered'), bill('0.00'))).toBe('BILL')
  expect(documentTitle(settings('regular', 'Estimate'), bill('9.00'))).toBe('ESTIMATE')
  expect(documentTitle(settings('regular'), bill('-9.00', 'credit_note'))).toBe('CREDIT NOTE')
})
