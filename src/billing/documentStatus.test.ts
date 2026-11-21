import { describe, expect, it } from 'vitest'
import { documentKind, documentStatus } from './documentStatus'
import type { BillDetail } from './queries'

const detail = (bill: Partial<BillDetail['bill']>, payments: Partial<BillDetail['payments'][number]>[] = []) =>
  ({ bill: { document_type: 'invoice', payment_status: 'paid', cancelled: false, ...bill }, payments }) as BillDetail

describe('documentStatus', () => {
  it('names invoice states with the shared payment words', () => {
    expect(documentStatus(detail({ payment_status: 'paid' }))).toEqual({ label: 'Paid', tone: 'ok' })
    expect(documentStatus(detail({ payment_status: 'partial' }))).toEqual({ label: 'Partially paid', tone: 'warn' })
    expect(documentStatus(detail({ payment_status: 'unpaid' }))).toEqual({ label: 'Unpaid', tone: 'bad' })
  })
  it('calls a cancelled document Voided whatever it was', () => {
    expect(documentStatus(detail({ cancelled: true, payment_status: 'paid' })).label).toBe('Voided')
  })
  it('describes a credit note by what happened to the money, never as Paid', () => {
    const note = { document_type: 'credit_note' as const, payment_status: 'unpaid', original_bill_number: 'INV/1' }
    expect(documentStatus(detail(note, [{ payment_method: 'cash' }])).label).toBe('Refunded')
    expect(documentStatus(detail(note, [{ payment_method: 'credit_note' }])).label).toBe('Applied to invoice INV/1')
    expect(documentStatus(detail(note, [])).label).toBe('No refund due')
  })
  it('titles the document kind', () => {
    expect(documentKind({ document_type: 'credit_note' } as BillDetail['bill'])).toBe('Credit note')
    expect(documentKind({ document_type: 'invoice' } as BillDetail['bill'])).toBe('Invoice')
  })
})
