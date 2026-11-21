import { paymentStatus } from '../components/labels'
import type { BillDetail } from './queries'

export type StatusTone = 'ok' | 'warn' | 'bad' | 'neutral'

/**
 * What to call a document's state. A credit note is a refund, not a sale that was "paid":
 * it says Refunded or Applied to the invoice instead of Paid with negative figures.
 */
export function documentStatus(detail: BillDetail): { label: string; tone: StatusTone } {
  const { bill, payments } = detail
  if (bill.cancelled) return { label: 'Voided', tone: 'bad' }
  if (bill.document_type === 'credit_note') {
    if (payments.some(p => p.payment_method === 'credit_note')) return { label: `Applied to invoice ${bill.original_bill_number ?? ''}`.trim(), tone: 'neutral' }
    if (payments.length) return { label: 'Refunded', tone: 'neutral' }
    return { label: 'No refund due', tone: 'neutral' }
  }
  const tone: StatusTone = bill.payment_status === 'paid' ? 'ok' : bill.payment_status === 'partial' ? 'warn' : 'bad'
  return { label: paymentStatus(bill.payment_status), tone }
}

/** The heading for the kind of document: "Invoice", "Credit note". */
export function documentKind(bill: BillDetail['bill']): string {
  return bill.document_type === 'credit_note' ? 'Credit note' : 'Invoice'
}
