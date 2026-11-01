import type { BillDetail, InvoiceSettings } from '../queries'

const DEFAULT_TITLE = 'TAX INVOICE'

/** The title the phone prints: a custom title, else TAX INVOICE when GST is charged,
 * BILL for an unregistered shop and BILL OF SUPPLY otherwise (BillSettings.documentTitle). */
export function documentTitle(settings: InvoiceSettings, bill: BillDetail['bill']): string {
  if (bill.document_type === 'credit_note') return 'CREDIT NOTE'
  const custom = settings.invoice_title.trim().toUpperCase()
  if (custom && custom !== DEFAULT_TITLE) return custom
  const hasGst = [bill.cgst_amount, bill.sgst_amount, bill.igst_amount].some(v => Number(v) !== 0)
  if (hasGst) return 'TAX INVOICE'
  return settings.gst_scheme === 'unregistered' ? 'BILL' : 'BILL OF SUPPLY'
}
