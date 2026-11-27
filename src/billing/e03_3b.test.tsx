import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { focusManager } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SIGNED_IN, fakeApi, ok, renderApp } from '../test-utils'
import { installInvoiceLocks } from './checkout/invoiceLocksTestSupport'

beforeEach(() => installInvoiceLocks())
afterEach(() => { vi.unstubAllGlobals(); focusManager.setFocused(undefined) })

const SHOP = (role: string) => ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Asha Stores', role }])
const product = { uuid: 'p1', name: 'Rice', selling_price: '100.00', quantity: '10', barcode: '8901', gst_percent: '18' }
const products = ok('GET', /^\/v1\/shops\/s1\/products\?/, { items: [product], next_cursor: null, total: 1 })
const lookup = ok('GET', /^\/v1\/shops\/s1\/products\/lookup\?code=8901$/, product)
const preview = {
  reviewed_context: `br1:${'b'.repeat(64)}`,
  subtotal: '100.00',
  discount_amount: '0.00',
  taxable_amount: '84.75',
  cgst_amount: '7.63',
  sgst_amount: '7.62',
  igst_amount: '0.00',
  round_off_amount: '0.00',
  total: '100.00',
  lines: [{ product_uuid: 'p1', name: 'Rice', quantity: '1', unit_price: '100.00', taxable_value: '84.75', gst: '15.25', amount: '100.00' }],
}
const KEYS = [
  'show_invoice_title', 'show_shop_name', 'show_shop_address', 'show_shop_phone', 'show_shop_email', 'show_shop_gstin',
  'show_customer_name', 'show_customer_phone', 'show_customer_address', 'show_customer_gstin', 'show_customer_legal_name',
  'show_customer_trade_name', 'show_customer_place_of_supply', 'show_invoice_number', 'show_invoice_date',
  'show_invoice_place_of_supply', 'show_invoice_supply_type', 'show_payment_details', 'show_gst_breakdown',
  'show_item_serial_column', 'show_item_name_column', 'show_hsn_column', 'show_quantity_column', 'show_rate_column',
  'show_gst_percent_column', 'show_gst_amount_column', 'show_amount_column', 'show_subtotal', 'show_discount',
  'show_taxable_amount', 'show_cgst_sgst_igst', 'show_gst_total', 'show_grand_total', 'show_footer_text',
  'show_upi_qr', 'show_amount_in_words', 'show_hsn_summary',
]
const SETTINGS = {
  revision: 's1:9',
  shop_name: 'Asha Stores', shop_phone: null, shop_email: null, shop_gstin: '27ABCDE1234F1Z5', shop_address: 'Pune',
  gst_registered: true, gst_scheme: 'regular', invoice_title: 'TAX INVOICE', footer_text: 'Thank you.',
  paper_size: 'a4', upi_id: null, terms_text: null, bank_details: null, round_off_total: true,
  default_tax_mode: 'inclusive' as const, round_off_mode: 'nearest' as const, round_off_increment: '1.00',
  series_name: 'Default', format_template: 'INV/{FY}/{SEQ}', sequence_padding: 4,
  reset_period: 'financial_year' as const, next_sequence: 12, next_bill_number_preview: 'INV/2627/0012',
  show: Object.fromEntries(KEYS.map(k => [k, true])),
}
const baseBill = {
  uuid: 'b1', bill_number: 'INV/2627/0012', bill_type: 'b2c', document_type: 'invoice',
  customer_name: 'Ravi Kumar', customer_phone: '9876543210', customer_gstin: null, customer_address_snapshot: 'Pune',
  place_of_supply_state_code: null, subtotal_amount: '100.00', discount_percent: '0', discount_amount: '0.00',
  taxable_amount: '84.75', cgst_amount: '7.63', sgst_amount: '7.62', igst_amount: '0.00',
  round_off_amount: '0.00', total_amount: '100.00', paid_amount: '100.00', balance_due: '0.00',
  payment_status: 'paid', cancelled: false, created_at: '2026-10-15T12:00:00', notes: 'Deliver before 5 PM',
}
const baseDetail = {
  bill: baseBill,
  items: [{ uuid: 'i1', product_uuid: 'p1', product_name: 'Rice', quantity: '1', selling_price: '100.00', subtotal: '100.00', taxable_value: '84.75', gst: '15.25', line_taxable_value: '84.75', line_gst: '15.25', amount: '100.00', gst_percent: '18', unit: 'kg' }],
  payments: [], credit_notes: [],
  history: [{ action: 'created', actor: 'Asha', details: 'backdated_to=2026-10-15', created_at: '2026-10-15T12:00:00' }],
}

async function scan(code: string) {
  await userEvent.type(await screen.findByLabelText('Scan barcode or search products'), `${code}{Enter}`)
}

test('NewBill sends bill_date and notes for admins and persists them in draft; staff cannot backdate', async () => {
  const calls = fakeApi([
    ...SIGNED_IN, SHOP('owner'), products, lookup,
    ok('GET', '/v1/shops/s1/categories', []),
    ok('GET', '/v1/shops/s1/invoice-settings', SETTINGS),
    ok('POST', '/v1/shops/s1/bills/preview', preview),
    ok('POST', '/v1/shops/s1/bills', baseDetail),
    ok('GET', '/v1/shops/s1/bills/b1', baseDetail),
  ])
  renderApp('/billing/new')
  await scan('8901')
  await screen.findByLabelText('Quantity for Rice')

  const dateInput = screen.getByLabelText('Invoice date')
  expect(dateInput).toBeEnabled()
  fireEvent.change(dateInput, { target: { value: '2026-10-15' } })

  const notesInput = screen.getByLabelText('Invoice notes')
  await userEvent.type(notesInput, 'Deliver before 5 PM')

  await waitFor(() => {
    const lastPreview = [...calls].reverse().find(c => c.path === '/v1/shops/s1/bills/preview')?.body as Record<string, unknown> | undefined
    expect(lastPreview).toMatchObject({ bill_date: '2026-10-15' })
  })
  await waitFor(() => expect(localStorage.getItem('storely.draft.bill.u1.s1')).toContain('"billDate":"2026-10-15"'))
  expect(localStorage.getItem('storely.draft.bill.u1.s1')).toContain('"notes":"Deliver before 5 PM"')

  await userEvent.click(screen.getByLabelText(/^Paid in full/))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  await screen.findByText(baseBill.bill_number)

  expect(calls.find(c => c.path === '/v1/shops/s1/bills')?.body).toMatchObject({
    bill_date: '2026-10-15',
    notes: 'Deliver before 5 PM',
  })
})

test('NewBill disables Invoice date for staff role', async () => {
  fakeApi([
    ...SIGNED_IN, SHOP('staff'), products, lookup,
    ok('GET', '/v1/shops/s1/categories', []),
    ok('GET', '/v1/shops/s1/invoice-settings', SETTINGS),
  ])
  renderApp('/billing/new')
  const dateInput = await screen.findByLabelText('Invoice date')
  expect(dateInput).toBeDisabled()
})

test('BillDetailPage shows date+time, notes, and lets admin edit posted bill details via PATCH', async () => {
  const updatedDetail = {
    ...baseDetail,
    bill: { ...baseBill, customer_name: 'Meera Nair', customer_phone: '9123456789', notes: 'Updated note' },
    history: [
      ...baseDetail.history,
      { action: 'edited', actor: 'Asha', details: 'customer_name: Ravi Kumar -> Meera Nair; notes updated', created_at: '2026-10-15T13:30:00' },
    ],
  }
  let currentDetail = baseDetail
  const calls = fakeApi([
    ...SIGNED_IN, SHOP('owner'),
    ok('GET', '/v1/shops/s1/invoice-settings', SETTINGS),
    ok('GET', '/v1/shops/s1/bills/b1', () => currentDetail),
    ok('PATCH', '/v1/shops/s1/bills/b1', () => { currentDetail = updatedDetail; return updatedDetail }),
  ])

  renderApp('/billing/b1')
  await screen.findByRole('heading', { name: 'INV/2627/0012' })
  // Date + time in header and initial notes visible
  expect(screen.getAllByText('Deliver before 5 PM').length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText(/12:00/).length).toBeGreaterThanOrEqual(1)

  await userEvent.click(screen.getByRole('button', { name: 'Edit details' }))
  const dialog = await screen.findByRole('dialog', { name: 'Edit details' })
  const nameField = within(dialog).getByLabelText('Customer name')
  await userEvent.clear(nameField)
  await userEvent.type(nameField, 'Meera Nair')
  const phoneField = within(dialog).getByLabelText('Customer phone')
  await userEvent.clear(phoneField)
  await userEvent.type(phoneField, '9123456789')
  const notesField = within(dialog).getByLabelText('Notes')
  await userEvent.clear(notesField)
  await userEvent.type(notesField, 'Updated note')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save details' }))

  await waitFor(() => expect(calls.find(c => c.method === 'PATCH' && c.path === '/v1/shops/s1/bills/b1')?.body).toEqual({
    customer_name: 'Meera Nair',
    customer_phone: '9123456789',
    customer_gstin: null,
    customer_address: 'Pune',
    notes: 'Updated note',
  }))
  expect(await screen.findByText(/customer_name: Ravi Kumar -> Meera Nair/)).toBeInTheDocument()
  expect(screen.getAllByText('Updated note').length).toBeGreaterThanOrEqual(1)
})

test('InvoiceSettingsPage edits invoice numbering controls, shows live preview, and links to Activity & audit', async () => {
  const calls = fakeApi([
    ...SIGNED_IN, SHOP('owner'),
    ok('GET', '/v1/shops/s1/invoice-settings', SETTINGS),
    ok('PATCH', '/v1/shops/s1/invoice-settings', {
      ...SETTINGS,
      revision: 's1:10',
      format_template: 'BILL/{YY}/{SEQ}',
      sequence_padding: 5,
      reset_period: 'monthly',
      next_sequence: 42,
      next_bill_number_preview: 'BILL/26/00042',
    }),
  ])

  renderApp('/settings?tab=invoice')
  const tpl = await screen.findByLabelText('Format template')
  expect(tpl).toHaveValue('INV/{FY}/{SEQ}')
  expect(screen.getByTestId('next-bill-number-preview')).toHaveTextContent('INV/2627/0012')
  const activityLinks = screen.getAllByRole('link', { name: 'Activity & audit' })
  expect(activityLinks.length).toBeGreaterThanOrEqual(2)
  expect(activityLinks.every(link => link.getAttribute('href') === '/activity')).toBe(true)

  fireEvent.change(tpl, { target: { value: 'BILL/{YY}/{SEQ}' } })
  const pad = screen.getByLabelText('Sequence padding')
  await userEvent.clear(pad)
  await userEvent.type(pad, '5')
  await userEvent.selectOptions(screen.getByLabelText('Reset period'), 'monthly')
  const nextSeq = screen.getByLabelText('Next sequence')
  await userEvent.clear(nextSeq)
  await userEvent.type(nextSeq, '42')

  expect(screen.getByTestId('next-bill-number-preview').textContent).toMatch(/^BILL\/\d{2}\/00042$/)

  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  await waitFor(() => expect(calls.find(c => c.method === 'PATCH')?.body).toEqual({
    format_template: 'BILL/{YY}/{SEQ}',
    sequence_padding: 5,
    reset_period: 'monthly',
    next_sequence: 42,
    expected_revision: 's1:9',
  }))
})

test('ShopActivity passes from and to date filters to audit-events and sidebar shows Activity & audit', async () => {
  const calls = fakeApi([
    ...SIGNED_IN, SHOP('owner'),
    ok('GET', /^\/v1\/shops\/s1\/audit-events\?/, {
      items: [{ uuid: 'a1', entity_type: 'bill', entity_uuid: 'b1', action: 'edited', details: 'notes updated', actor: 'Asha', device_id: null, created_at: '2026-10-15T12:00:00' }],
      has_more: false,
    }),
  ])

  renderApp('/activity')
  await screen.findByText('notes updated')
  expect(screen.getByRole('link', { name: 'Activity & audit' })).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } })
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-31' } })

  await waitFor(() => {
    const paths = calls.filter(c => c.path.startsWith('/v1/shops/s1/audit-events?')).map(c => c.path)
    expect(paths.some(p => p.includes('from=2026-10-01') && p.includes('to=2026-10-31'))).toBe(true)
  })
})

test('ProductsPage opens ShopStockLedger modal with filters, balance_after, and pagination', async () => {
  const calls = fakeApi([
    ...SIGNED_IN, SHOP('owner'), products,
    ok('GET', '/v1/shops/s1/categories', []),
    ok('GET', '/v1/shops/s1/products/stock-summary', { low: 0, out: 0, expiring: 0 }),
    ok('GET', /^\/v1\/shops\/s1\/stock-movements\?/, {
      items: [
        {
          uuid: 'm1', product_uuid: 'p1', product_name: 'Rice', movement_type: 'sale',
          quantity_delta: '-2', balance_after: '8', reason: null, unit_cost: '70.00',
          source_document_type: 'bill', source_document_uuid: 'b1', created_at: '2026-10-15T12:00:00',
        },
      ],
      next_cursor: 'cur-2',
    }),
  ])

  renderApp('/products')
  await screen.findByText('Rice')
  await userEvent.click(screen.getByRole('button', { name: 'Stock ledger' }))

  const dialog = await screen.findByRole('dialog', { name: 'Stock ledger' })
  const table = await within(dialog).findByRole('table')
  expect(within(table).getByText('Sale')).toBeInTheDocument()
  expect(within(table).getByText('-2')).toBeInTheDocument()
  expect(within(table).getByText('8')).toBeInTheDocument()

  await userEvent.selectOptions(within(dialog).getByLabelText('Movement type'), 'sale')
  fireEvent.change(within(dialog).getByLabelText('From'), { target: { value: '2026-10-01' } })
  fireEvent.change(within(dialog).getByLabelText('To'), { target: { value: '2026-10-31' } })

  await waitFor(() => {
    const paths = calls.filter(c => c.path.startsWith('/v1/shops/s1/stock-movements?')).map(c => c.path)
    expect(paths.some(p => p.includes('type=sale') && p.includes('from=2026-10-01') && p.includes('to=2026-10-31'))).toBe(true)
  })

  await userEvent.click(await within(dialog).findByRole('button', { name: 'Next' }))
  await waitFor(() => {
    const paths = calls.filter(c => c.path.startsWith('/v1/shops/s1/stock-movements?')).map(c => c.path)
    expect(paths.some(p => p.includes('cursor=cur-2'))).toBe(true)
  })
})
