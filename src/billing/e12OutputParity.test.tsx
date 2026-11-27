import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InvoiceDocument } from './invoice/InvoiceDocument'
import { shareMessage } from './share'
import type { BillDetail, InvoiceSettings } from './queries'

function makeDetail(overrides: Record<string, unknown> = {}): BillDetail {
  return {
    bill: {
      uuid: 'b-1',
      bill_number: 'INV/2627/0101',
      bill_type: 'b2b',
      document_type: 'invoice',
      customer_name: 'Acme Retail',
      customer_phone: '9876543210',
      customer_gstin: '27ABCDE1234F1Z5',
      customer_gst_legal_name: 'Acme Retail Pvt Ltd',
      customer_gst_trade_name: 'Acme Mart',
      customer_address_snapshot: 'MG Road, Pune',
      place_of_supply_state_code: '27',
      subtotal_amount: '210.00',
      discount_mode: 'amount',
      discount_value: '10.00',
      discount_percent: '0',
      discount_amount: '10.00',
      tax_mode: 'exclusive',
      taxable_amount: '200.00',
      cgst_amount: '18.00',
      sgst_amount: '18.00',
      igst_amount: '0.00',
      round_off_amount: '0.00',
      total_amount: '236.00',
      paid_amount: '100.00',
      balance_due: '136.00',
      payment_status: 'partial',
      payment_method: 'upi',
      cancelled: false,
      cancel_reason: null,
      created_at: '2026-11-27T11:30:00+05:30',
      item_count: 1,
      lifecycle_status: 'finalized',
      original_bill_number: null,
      original_bill_uuid: null,
      notes: 'Deliver before 6 PM',
      ...overrides,
    },
    items: [
      {
        uuid: 'i-1',
        product_uuid: 'p-1',
        product_name: 'Organic Tea 500g',
        hsn_code: '0902',
        unit: 'pkt',
        quantity: '2',
        selling_price: '120.00',
        subtotal: '240.00',
        discount_mode: 'percent',
        discount_value: '10',
        discount_amount: '24.00',
        taxable_value: '200.00',
        gst: '36.00',
        gst_percent: '18',
        line_taxable_value: '200.00',
        line_gst: '36.00',
        amount: '236.00',
        cgst: '18.00',
        sgst: '18.00',
        igst: '0.00',
        original_item_uuid: null,
      },
    ],
    payments: [{ uuid: 'pay-1', amount: '100.00', payment_method: 'upi', payment_reference: 'UTR123', notes: null, received_at: '2026-11-27T11:30:00+05:30' }],
    credit_notes: [],
    history: [],
  } as unknown as BillDetail
}

function makeSettings(showOverrides: Record<string, boolean> = {}): InvoiceSettings {
  return {
    shop_name: 'Storely Mart',
    shop_address: 'FC Road, Pune',
    shop_phone: '9999999999',
    shop_email: 'shop@storely.test',
    shop_gstin: '27AABCU9603R1ZM',
    gst_scheme: 'regular',
    gst_registered: true,
    invoice_title: 'TAX INVOICE',
    paper_size: 'A4',
    shop_logo: null,
    digital_signature: null,
    upi_id: 'storely@upi',
    bank_details: 'HDFC 1234',
    terms_text: 'No returns after 7 days.',
    footer_text: 'Thank you!',
    show: {
      show_customer_trade_name: true,
      show_gst_breakdown: true,
      show_gst_total: true,
      ...showOverrides,
    },
  } as unknown as InvoiceSettings
}

describe('E12.1–E12.2 invoice output parity', () => {
  it('renders tax mode indicator, trade name, line & doc discounts, and notes on A4 and 80mm', () => {
    const { rerender } = render(<InvoiceDocument detail={makeDetail()} settings={makeSettings()} paper="A4" />)
    expect(screen.getByText('Prices excl. GST')).toBeInTheDocument()
    expect(screen.getByText('Acme Mart')).toBeInTheDocument()
    expect(screen.getByText('₹24.00 (10%)')).toBeInTheDocument()
    expect(screen.getByText('Discount (₹10.00 off)')).toBeInTheDocument()
    expect(screen.getByText('Deliver before 6 PM')).toBeInTheDocument()

    rerender(<InvoiceDocument detail={makeDetail({ tax_mode: 'inclusive' })} settings={makeSettings()} paper="80mm" />)
    expect(screen.getByText('Prices incl. GST')).toBeInTheDocument()
    expect(screen.getByText('Disc: ₹24.00')).toBeInTheDocument()
  })

  it('honors show_customer_trade_name, show_gst_breakdown, and show_gst_total flags', () => {
    render(
      <InvoiceDocument
        detail={makeDetail()}
        settings={makeSettings({ show_customer_trade_name: false, show_gst_breakdown: false, show_gst_total: true })}
        paper="A4"
      />,
    )
    expect(screen.queryByText('Acme Mart')).not.toBeInTheDocument()
    expect(screen.queryByText('CGST')).not.toBeInTheDocument()
    expect(screen.getByText('Total GST')).toBeInTheDocument()
    expect(screen.getAllByText('₹36.00').length).toBeGreaterThanOrEqual(1)
  })

  it('formats WhatsApp shareMessage with discounts, notes, and VOID status', () => {
    const msg = shareMessage(makeDetail(), 'Storely Mart')
    expect(msg).toContain('Line discounts: ₹24.00')
    expect(msg).toContain('Discount (₹10.00 off): ₹10.00')
    expect(msg).toContain('Balance due: ₹136.00')
    expect(msg).toContain('Notes: Deliver before 6 PM')

    const voidMsg = shareMessage(makeDetail({ cancelled: true, cancel_reason: 'Duplicate' }), 'Storely Mart')
    expect(voidMsg).toContain('VOID Invoice INV/2627/0101 (Duplicate)')
    expect(voidMsg).toContain('This invoice has been voided.')
    expect(voidMsg).not.toContain('Balance due:')
  })
})
