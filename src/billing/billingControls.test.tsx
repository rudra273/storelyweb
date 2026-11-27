import { render, screen, waitFor, within } from '@testing-library/react'
import { focusManager } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SIGNED_IN, fakeApi, ok, renderApp } from '../test-utils'
import { installInvoiceLocks } from './checkout/invoiceLocksTestSupport'
import { InvoiceDocument } from './invoice/InvoiceDocument'
import type { BillDetail, InvoiceSettings } from './queries'

beforeEach(() => installInvoiceLocks())
afterEach(() => { vi.unstubAllGlobals(); focusManager.setFocused(undefined) })

const SHOP = (role: string) => ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Asha Stores', role }])
const product = { uuid: 'p1', name: 'Rice', selling_price: '100.00', quantity: '10', barcode: '8901', gst_percent: '18' }
const products = ok('GET', /^\/v1\/shops\/s1\/products\?/, { items: [product], next_cursor: null, total: 1 })
const lookup = ok('GET', /^\/v1\/shops\/s1\/products\/lookup\?code=8901$/, product)
const preview = {
  reviewed_context: `br1:${'b'.repeat(64)}`,
  subtotal: '200.00',
  discount_amount: '50.00',
  taxable_amount: '150.00',
  cgst_amount: '13.50',
  sgst_amount: '13.50',
  igst_amount: '0.00',
  round_off_amount: '3.00',
  total: '180.00',
  lines: [{ product_uuid: 'p1', name: 'Rice', quantity: '2', unit_price: '100.00', taxable_value: '150.00', gst: '27.00', amount: '177.00' }],
}
const bill = {
  uuid: 'b1', bill_number: 'INV/2627/B0001', bill_type: 'b2c', document_type: 'invoice',
  customer_name: 'Walk-in', customer_phone: null, customer_gstin: null, customer_address_snapshot: null,
  place_of_supply_state_code: null, subtotal_amount: '200.00', discount_percent: '0', discount_amount: '50.00',
  taxable_amount: '150.00', cgst_amount: '13.50', sgst_amount: '13.50', igst_amount: '0.00',
  round_off_amount: '3.00', total_amount: '180.00', paid_amount: '180.00', balance_due: '0.00',
  payment_status: 'paid', cancelled: false, created_at: '2026-10-26T12:00:00',
}
const detail = {
  bill,
  items: [{ uuid: 'i1', product_uuid: 'p1', product_name: 'Rice', quantity: '2', selling_price: '100.00', subtotal: '200.00', taxable_value: '75.00', gst: '13.50', line_taxable_value: '150.00', line_gst: '27.00', amount: '177.00', gst_percent: '18', unit: 'kg' }],
  payments: [], credit_notes: [], history: [],
}

const KEYS = ['show_invoice_title', 'show_shop_name', 'show_shop_address', 'show_shop_phone', 'show_shop_email', 'show_shop_gstin', 'show_customer_name', 'show_customer_phone', 'show_customer_address', 'show_customer_gstin', 'show_customer_legal_name', 'show_customer_trade_name', 'show_customer_place_of_supply', 'show_invoice_number', 'show_invoice_date', 'show_invoice_place_of_supply', 'show_invoice_supply_type', 'show_payment_details', 'show_gst_breakdown', 'show_item_serial_column', 'show_item_name_column', 'show_hsn_column', 'show_quantity_column', 'show_rate_column', 'show_gst_percent_column', 'show_gst_amount_column', 'show_amount_column', 'show_subtotal', 'show_discount', 'show_taxable_amount', 'show_cgst_sgst_igst', 'show_gst_total', 'show_grand_total', 'show_footer_text', 'show_upi_qr', 'show_amount_in_words', 'show_hsn_summary']
const SETTINGS = {
  revision: 's1:9',
  shop_name: 'Asha Stores', shop_phone: null, shop_email: null, shop_gstin: '27ABCDE1234F1Z5', shop_address: 'Pune',
  gst_registered: true, gst_scheme: 'regular', invoice_title: 'TAX INVOICE', footer_text: 'Thank you.',
  paper_size: 'a4', upi_id: null, terms_text: null, bank_details: null, round_off_total: true,
  default_tax_mode: 'inclusive' as const, round_off_mode: 'nearest' as const, round_off_increment: '1.00',
  show: Object.fromEntries(KEYS.map(k => [k, true])),
}

async function scan(code: string) {
  await userEvent.type(await screen.findByLabelText('Scan barcode or search products'), `${code}{Enter}`)
}

test('checkout sends per-line discount, per-line tax mode, fixed document discount, exclusive tax, and round-off controls', async () => {
  const calls = fakeApi([
    ...SIGNED_IN, SHOP('owner'), products, lookup,
    ok('GET', '/v1/shops/s1/categories', []),
    ok('GET', '/v1/shops/s1/invoice-settings', { ...SETTINGS, default_tax_mode: 'exclusive', round_off_mode: 'up', round_off_increment: '5.00' }),
    ok('POST', '/v1/shops/s1/bills/preview', preview),
    ok('POST', '/v1/shops/s1/bills', detail),
    ok('GET', '/v1/shops/s1/bills/b1', detail),
  ])
  renderApp('/billing/new')
  await scan('8901')
  await screen.findByLabelText('Quantity for Rice')

  // Initialized from shop defaults
  await waitFor(() => expect(screen.getByLabelText('Tax mode')).toHaveValue('exclusive'))
  expect(screen.getByLabelText('Round-off')).toHaveValue('up')
  expect(screen.getByLabelText('Round-off increment')).toHaveValue('5.00')

  // Expand per-line controls and set ₹20 line discount + inclusive override
  await userEvent.click(screen.getByRole('button', { name: 'Line options for Rice' }))
  await userEvent.selectOptions(screen.getByLabelText('Discount type for Rice'), 'amount')
  await userEvent.type(screen.getByLabelText('Discount for Rice'), '20')
  await userEvent.selectOptions(screen.getByLabelText('Tax mode for Rice'), 'inclusive')

  // Switch document discount to fixed ₹ amount (>100 allowed for fixed ₹)
  await userEvent.selectOptions(screen.getByLabelText('Discount mode'), 'amount')
  const docDiscount = screen.getByLabelText('Discount (₹)')
  await userEvent.clear(docDiscount)
  await userEvent.type(docDiscount, '120')

  // Override round-off increment to ₹10
  await userEvent.selectOptions(screen.getByLabelText('Round-off increment'), '10.00')

  await waitFor(() => {
    const lastPreview = [...calls].reverse().find(c => c.path === '/v1/shops/s1/bills/preview')?.body as Record<string, unknown> | undefined
    expect(lastPreview).toMatchObject({
      discount_mode: 'amount',
      discount_value: '120',
      discount_percent: '0',
      tax_mode: 'exclusive',
      round_off_mode: 'up',
      round_off_increment: '10.00',
      items: [{ product_uuid: 'p1', quantity: '1', discount_mode: 'amount', discount_value: '20', tax_mode: 'inclusive' }],
    })
  })

  await userEvent.click(screen.getByLabelText(/^Paid in full/))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  await screen.findByText(bill.bill_number)

  expect(calls.find(c => c.path === '/v1/shops/s1/bills')?.body).toMatchObject({
    discount_mode: 'amount',
    discount_value: '120',
    discount_percent: '0',
    tax_mode: 'exclusive',
    round_off_mode: 'up',
    round_off_increment: '10.00',
    items: [{ product_uuid: 'p1', quantity: '1', discount_mode: 'amount', discount_value: '20', tax_mode: 'inclusive' }],
  })
})

test('billing controls persist in drafts and older saved drafts without new fields still hydrate', async () => {
  fakeApi([
    ...SIGNED_IN, SHOP('staff'), products, lookup,
    ok('GET', '/v1/shops/s1/categories', []),
    ok('GET', '/v1/shops/s1/invoice-settings', SETTINGS),
    ok('POST', '/v1/shops/s1/bills/preview', preview),
  ])
  const first = renderApp('/billing/new')
  await scan('8901')
  await screen.findByLabelText('Quantity for Rice')
  await userEvent.click(screen.getByRole('button', { name: 'Line options for Rice' }))
  await userEvent.type(screen.getByLabelText('Discount for Rice'), '10')
  await userEvent.selectOptions(screen.getByLabelText('Discount mode'), 'amount')
  await userEvent.clear(screen.getByLabelText('Discount (₹)'))
  await userEvent.type(screen.getByLabelText('Discount (₹)'), '25')
  await userEvent.selectOptions(screen.getByLabelText('Tax mode'), 'exclusive')
  await userEvent.selectOptions(screen.getByLabelText('Round-off'), 'down')
  await userEvent.selectOptions(screen.getByLabelText('Round-off increment'), '0.50')
  await waitFor(() => expect(localStorage.getItem('storely.draft.bill.u1.s1')).toContain('"discountMode":"amount"'))
  first.unmount()

  const second = renderApp('/billing/new')
  expect(await screen.findByLabelText('Discount (₹)')).toHaveValue(25)
  expect(screen.getByLabelText('Tax mode')).toHaveValue('exclusive')
  expect(screen.getByLabelText('Round-off')).toHaveValue('down')
  expect(screen.getByLabelText('Round-off increment')).toHaveValue('0.50')
  expect(screen.getByText(/Disc 10%/)).toBeInTheDocument()
  second.unmount()

  // Simulate an older saved draft without the new E03.3A fields
  const raw = JSON.parse(localStorage.getItem('storely.draft.bill.u1.s1')!)
  delete raw.data.discountMode
  delete raw.data.taxMode
  delete raw.data.roundOffMode
  delete raw.data.roundOffIncrement
  delete raw.data.items[0].discount_mode
  delete raw.data.items[0].discount_value
  delete raw.data.items[0].tax_mode
  localStorage.setItem('storely.draft.bill.u1.s1', JSON.stringify(raw))

  renderApp('/billing/new')
  expect(await screen.findByLabelText('Quantity for Rice')).toHaveValue('1')
  expect(screen.getByLabelText('Discount (%)')).toHaveValue(25)
})

test('percentage discount rejects values over 100% locally', async () => {
  fakeApi([
    ...SIGNED_IN, SHOP('staff'), products, lookup,
    ok('GET', '/v1/shops/s1/categories', []),
    ok('GET', '/v1/shops/s1/invoice-settings', SETTINGS),
    ok('POST', '/v1/shops/s1/bills/preview', preview),
  ])
  renderApp('/billing/new')
  await scan('8901')
  await screen.findByLabelText('Quantity for Rice')
  const docDiscount = screen.getByLabelText('Discount (%)')
  await userEvent.clear(docDiscount)
  await userEvent.type(docDiscount, '105')
  expect(await screen.findByText('Enter a discount between 0% and 100%.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeDisabled()
})

test('invoice settings saves default tax mode, round-off mode, and increment synchronized with round_off_total', async () => {
  const calls = fakeApi([
    ...SIGNED_IN, SHOP('owner'),
    ok('GET', '/v1/shops/s1/invoice-settings', SETTINGS),
    ok('PATCH', '/v1/shops/s1/invoice-settings', {
      ...SETTINGS, revision: 's1:10', default_tax_mode: 'exclusive', round_off_mode: 'up', round_off_increment: '5.00', round_off_total: true,
    }),
  ])
  renderApp('/settings?tab=pricing')
  const taxSelect = await screen.findByLabelText('Default rate tax mode')
  expect(taxSelect).toHaveValue('inclusive')
  await userEvent.selectOptions(taxSelect, 'exclusive')
  const roundMode = screen.getByLabelText('Round-off mode')
  await userEvent.selectOptions(roundMode, 'none')
  expect(screen.queryByLabelText('Round-off increment')).not.toBeInTheDocument()
  await userEvent.selectOptions(roundMode, 'up')
  await userEvent.selectOptions(screen.getByLabelText('Round-off increment'), '5.00')
  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  await waitFor(() => expect(calls.find(c => c.method === 'PATCH')?.body).toEqual({
    default_tax_mode: 'exclusive',
    round_off_mode: 'up',
    round_off_total: true,
    round_off_increment: '5.00',
    expected_revision: 's1:9',
  }))
})

test('InvoiceDocument renders line discounts, fixed rupee document discount label, and exact BigInt HSN totals', () => {
  const docDetail = {
    bill: {
      ...bill,
      subtotal_amount: '100.00',
      discount_mode: 'amount',
      discount_value: '10.00',
      discount_percent: '0',
      discount_amount: '15.00',
      taxable_amount: '0.30',
      cgst_amount: '0.02',
      sgst_amount: '0.02',
      igst_amount: '0.00',
      total_amount: '0.34',
      paid_amount: '0.34',
      balance_due: '0.00',
    },
    items: [
      { uuid: 'i1', product_uuid: 'p1', product_name: 'Item A', hsn_code: '1006', unit: 'pcs', quantity: '1', selling_price: '50.00', subtotal: '50.00', discount_mode: 'percent', discount_value: '10', discount_amount: '5.00', taxable_value: '0.10', gst: '0.01', line_taxable_value: '0.10', line_gst: '0.01', amount: '0.11', gst_percent: '5' },
      { uuid: 'i2', product_uuid: 'p2', product_name: 'Item B', hsn_code: '1006', unit: 'pcs', quantity: '1', selling_price: '50.00', subtotal: '50.00', discount_mode: 'amount', discount_value: '0', discount_amount: '0.00', taxable_value: '0.20', gst: '0.03', line_taxable_value: '0.20', line_gst: '0.03', amount: '0.23', gst_percent: '5' },
    ],
    payments: [],
    credit_notes: [],
    history: [],
  } as unknown as BillDetail

  render(<InvoiceDocument detail={docDetail} settings={SETTINGS as unknown as InvoiceSettings} paper="A4" />)
  expect(screen.getByRole('columnheader', { name: 'Disc.' })).toBeInTheDocument()
  expect(screen.getByText('₹5.00 (10%)')).toBeInTheDocument()
  expect(screen.getByText('Discount (₹10.00 off)')).toBeInTheDocument()
  const hsnTable = screen.getByRole('table', { name: 'Tax summary by HSN' })
  expect(within(hsnTable).getByText('₹0.30')).toBeInTheDocument()
  expect(within(hsnTable).getByText('₹0.04')).toBeInTheDocument()
})
