import { describe, expect, it } from 'vitest'
import { shareMessage, whatsappLink, whatsappNumber } from './share'
import type { BillDetail } from './queries'

describe('whatsappNumber', () => {
  it('adds India\'s code to a plain 10-digit number and strips formatting', () => {
    expect(whatsappNumber('98765 43210')).toBe('919876543210')
    expect(whatsappNumber('098765 43210')).toBe('919876543210')
  })
  it('keeps a number that already has a country code', () => {
    expect(whatsappNumber('+91 98765 43210')).toBe('919876543210')
    expect(whatsappNumber('00447911123456')).toBe('447911123456')
  })
  it('rejects text that cannot be a phone number', () => {
    expect(whatsappNumber('12345')).toBeNull()
    expect(whatsappNumber('abc')).toBeNull()
    expect(whatsappNumber('')).toBeNull()
  })
})

describe('share message and link', () => {
  const detail = { bill: { bill_number: 'INV/1', total_amount: '189.00', balance_due: '89.00' } } as BillDetail
  it('states the total and what is still due', () => {
    expect(shareMessage(detail, 'Asha Stores')).toBe('Asha Stores\nInvoice INV/1 · ₹189.00\nBalance due: ₹89.00')
    expect(shareMessage({ bill: { ...detail.bill, balance_due: '0.00' } } as BillDetail, 'Asha Stores')).toContain('Paid in full')
  })
  it('encodes the message into the wa.me link', () => {
    expect(whatsappLink('919876543210', 'a b\nc')).toBe('https://wa.me/919876543210?text=a%20b%0Ac')
  })
})
