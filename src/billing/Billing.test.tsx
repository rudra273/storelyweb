import { act, screen, waitFor, within } from '@testing-library/react'
import { focusManager } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SIGNED_IN, fakeApi, ok, renderApp } from '../test-utils'

import { installInvoiceLocks } from './checkout/invoiceLocksTestSupport'

beforeEach(() => installInvoiceLocks())

const SHOP = (role: string) => ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Asha Stores', role }])
const bill = { uuid: 'b1', bill_number: 'INV/2627/A0001', bill_type: 'b2c', document_type: 'invoice', customer_name: 'Ravi', customer_phone: null, customer_gstin: null, customer_address_snapshot: null, place_of_supply_state_code: null, subtotal_amount: '210.00', discount_amount: '21.00', taxable_amount: '180.00', cgst_amount: '4.50', sgst_amount: '4.50', igst_amount: '0.00', round_off_amount: '0.00', total_amount: '189.00', paid_amount: '0.00', balance_due: '189.00', payment_status: 'unpaid', cancelled: false, created_at: '2026-10-26T12:00:00' }
const detail = { bill, items: [{ uuid: 'i1', product_uuid: 'p1', product_name: 'Rice', quantity: '2', selling_price: '105.00', subtotal: '210.00', taxable_value: '90.00', gst: '4.50', line_taxable_value: '180.00', line_gst: '9.00', amount: '189.00', gst_percent: '5', unit: 'kg' }], payments: [], credit_notes: [], history: [] }
const product = { uuid: 'p1', name: 'Rice', selling_price: '105.00', quantity: '10', barcode: '8901' }
const preview = { reviewed_context: `br1:${'a'.repeat(64)}`, subtotal: '210.00', discount_amount: '21.00', taxable_amount: '180.00', cgst_amount: '4.50', sgst_amount: '4.50', igst_amount: '0.00', round_off_amount: '0.00', total: '189.00' }
const products = ok('GET', /^\/v1\/shops\/s1\/products\?/, { items: [product], next_cursor: null, total: 1 })
const lookup = ok('GET', /^\/v1\/shops\/s1\/products\/lookup\?code=8901$/, product)
const CHECKOUT = [products, lookup, ok('GET', '/v1/shops/s1/categories', [])]

/** Scans a barcode the way a keyboard-wedge scanner does: the code, then Enter. */
async function scan(code: string) {
  await userEvent.type(await screen.findByLabelText('Scan barcode or search products'), `${code}{Enter}`)
}
async function addRice() {
  await scan('8901')
  await screen.findByLabelText('Quantity for Rice')
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
}
const returnLine = { item_uuid: 'i1', product_name: 'Rice', unit: 'kg', sold: '2', already_returned: '0', remaining: '2', returning: '0.5', credit: '94.50', goes_back_to_stock: true }
const returnReview = { lines: [returnLine], subtotal: '90.00', taxable_amount: '90.00', cgst_amount: '2.25', sgst_amount: '2.25', igst_amount: '0.00', round_off_amount: '0.00', tax_amount: '4.50', credit_total: '94.50', settlement: 'refund', invoice_paid: '0.00', invoice_due: '189.00', invoice_due_after: '189.00', refund_to_customer: '94.50', reduces_invoice_due: '0.00', can_return: true }
afterEach(() => { vi.unstubAllGlobals(); focusManager.setFocused(undefined) })

test('staff can browse bills and filters are sent to the API', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ok('GET', /^\/v1\/shops\/s1\/bills\?/, { items: [bill], total: 1, next_cursor: null })])
  renderApp('/billing')
  expect(await screen.findByRole('link', { name: bill.bill_number })).toBeInTheDocument()
  await userEvent.selectOptions(screen.getByLabelText('Payment status'), 'unpaid')
  await userEvent.type(screen.getByLabelText('Search invoices'), 'Ravi & Co')
  await waitFor(() => expect(calls.some(c => c.path.includes('q=Ravi+%26+Co') && c.path.includes('status=unpaid'))).toBe(true))
})

test('staff can record payments but cannot void or return items', async () => {
  fakeApi([...SIGNED_IN, SHOP('staff'), ok('GET', '/v1/shops/s1/bills/b1', detail)])
  renderApp('/billing/b1')
  expect(await screen.findByRole('button', { name: 'Record payment' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Return items' })).not.toBeInTheDocument()
  expect(screen.queryByText('Void invoice')).not.toBeInTheDocument()
  const figures = screen.getByRole('group', { name: 'Amounts' })
  expect(within(figures).getAllByText('₹189.00')).toHaveLength(2) // total and balance due
  expect(screen.getByText('Unpaid')).toBeInTheDocument()
})

test('a payment sends the entered decimal and reference to the correct bill', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ok('GET', '/v1/shops/s1/bills/b1', detail), ok('POST', '/v1/shops/s1/bills/b1/payments', detail)])
  renderApp('/billing/b1')
  await userEvent.click(await screen.findByRole('button', { name: 'Record payment' }))
  const dialog = screen.getByRole('dialog')
  await userEvent.clear(within(dialog).getByLabelText('Amount (₹)'))
  await userEvent.type(within(dialog).getByLabelText('Amount (₹)'), '50.25')
  await userEvent.type(within(dialog).getByLabelText('Reference'), 'UPI123')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))
  await waitFor(() => expect(calls.some(c => c.path.endsWith('/payments') && c.method === 'POST' && (c.body as { amount: string }).amount === '50.25')).toBe(true))
})

test('owners can issue a return for selected quantities', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/bills/b1', detail), ok('POST', '/v1/shops/s1/bills/b1/credit-note/preview', returnReview), ok('POST', '/v1/shops/s1/bills/b1/credit-note', detail)])
  renderApp('/billing/b1')
  await userEvent.click(await screen.findByRole('button', { name: 'Return items' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByRole('button', { name: 'Return items' })).toBeDisabled()
  await userEvent.type(within(dialog).getByLabelText('Return Rice'), '0.5')
  const summary = await within(dialog).findByRole('region', { name: 'Return summary' })
  expect(await within(summary).findByText('Credit note total')).toBeInTheDocument()
  expect(within(summary).getByText('Refund to customer')).toBeInTheDocument()
  expect(within(dialog).getByText(/can return 2/)).toBeInTheDocument()
  await waitFor(() => expect(calls.some(c => c.path.endsWith('/credit-note/preview') && (c.body as { quantities: Record<string, string> }).quantities.i1 === '0.5')).toBe(true))
  await userEvent.selectOptions(within(dialog).getByLabelText('Settlement'), 'adjust')
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Return items' })).toBeEnabled())
  // A return needs a reason, so the record explains itself later.
  await userEvent.click(within(dialog).getByRole('button', { name: 'Return items' }))
  expect(await within(dialog).findByText(/reason/i, { selector: '.field-error' })).toBeInTheDocument()
  expect(calls.some(c => c.path.endsWith('/credit-note') && c.method === 'POST')).toBe(false)
  await userEvent.type(within(dialog).getByLabelText('Reason for the return'), 'Damaged in transit')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Return items' }))
  await waitFor(() => expect(calls.find(c => c.path.endsWith('/credit-note'))?.body).toMatchObject({ quantities: { i1: '0.5' }, settlement: 'adjust', reason: 'Damaged in transit' }))
})

test('a voided invoice has no payment, void or return actions', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/bills/b1', { ...detail, bill: { ...bill, cancelled: true, cancel_reason: 'Mistake' } })])
  renderApp('/billing/b1')
  await screen.findByText(/Voided: Mistake/)
  for (const name of ['Record payment', 'Return items', 'Void invoice']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
})

test('a bill waits for server pricing and confirmation, then sends decimal input', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', detail), ok('GET', '/v1/shops/s1/bills/b1', detail)])
  renderApp('/billing/new')
  expect(await screen.findByRole('button', { name: /^Create invoice/ })).toBeDisabled()
  await addRice()
  await userEvent.click(screen.getByLabelText('Not paid yet'))
  await userEvent.click(screen.getByLabelText('Keep this balance unassigned'))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  await screen.findByText(bill.bill_number)
  expect(calls.find(c => c.path === '/v1/shops/s1/bills')?.body).toMatchObject({ items: [{ product_uuid: 'p1', quantity: '1' }], discount_percent: '0', settlement_choice: 'unpaid', reviewed_context: preview.reviewed_context, allow_unassigned_credit: true, payment: { amount: '0', method: 'cash' } })
})

test('a bill cannot be created until the cashier says how the customer paid', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', detail), ok('GET', '/v1/shops/s1/bills/b1', detail)])
  renderApp('/billing/new')
  await addRice()
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Choose how the customer paid')
  expect(calls.some(c => c.path === '/v1/shops/s1/bills')).toBe(false)
  await userEvent.click(screen.getByLabelText(/^Paid in full/))
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  await screen.findByText(bill.bill_number)
  expect(calls.find(c => c.path === '/v1/shops/s1/bills')?.body).toMatchObject({ settlement_choice: 'full', reviewed_context: preview.reviewed_context, allow_unassigned_credit: false, payment: { amount: preview.total, method: 'cash' } })
})

test('a failed save keeps an identical body for retry and locks the cart', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', { error: { code: 'network', message: 'Connection interrupted' } }, 503)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText('Not paid yet'))
  await userEvent.click(screen.getByLabelText('Keep this balance unassigned'))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('cart is locked')
  expect(screen.getByLabelText('Quantity for Rice')).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Retry saving invoice' }))
  const writes = calls.filter(c => c.path === '/v1/shops/s1/bills')
  expect(writes).toHaveLength(2)
  expect(writes[0]!.body).toEqual(writes[1]!.body)
  expect(writes[0]!.headers.get('Idempotency-Key')).toBeTruthy()
  expect(writes[0]!.headers.get('Idempotency-Key')).toBe(writes[1]!.headers.get('Idempotency-Key'))
})

test('an unfinished invoice survives leaving the page and can be discarded', async () => {
  fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview)])
  const first = renderApp('/billing/new')
  await userEvent.click(await screen.findByRole('button', { name: 'Add customer' }))
  await userEvent.type(await screen.findByLabelText('Name'), 'Ravi')
  await userEvent.click(screen.getByRole('button', { name: 'Done' }))
  await addRice()
  await userEvent.click(screen.getByLabelText('Not paid yet'))
  first.unmount()

  fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview)])
  renderApp('/billing/new')
  expect(await screen.findByLabelText('Quantity for Rice')).toHaveValue(1)
  expect(screen.getByText('Ravi')).toBeInTheDocument()
  expect(screen.getByText(/unfinished invoice from/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Discard draft' }))
  expect(screen.queryByLabelText('Quantity for Rice')).not.toBeInTheDocument()
  expect(screen.getByText('Walk-in customer')).toBeInTheDocument()
  expect(Object.keys(localStorage).filter(k => k.startsWith('storely.draft.'))).toEqual([])
})

test('a bill whose save was not confirmed comes back locked with the same retry key', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', { error: { code: 'network', message: 'Connection interrupted' } }, 503)])
  const first = renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText('Not paid yet'))
  await userEvent.click(screen.getByLabelText('Keep this balance unassigned'))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  await screen.findByRole('button', { name: 'Retry saving invoice' })
  first.unmount()

  renderApp('/billing/new')
  expect(await screen.findByText(/was not confirmed before this page closed/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Discard draft' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Quantity for Rice')).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Retry saving invoice' }))
  const writes = calls.filter(c => c.path === '/v1/shops/s1/bills')
  expect(writes).toHaveLength(2)
  expect(writes[0]!.body).toEqual(writes[1]!.body)
  expect(writes[0]!.headers.get('Idempotency-Key')).toBe(writes[1]!.headers.get('Idempotency-Key'))
})

test('empty and failed bill lists are explained', async () => {
  fakeApi([...SIGNED_IN, SHOP('staff'), ok('GET', /^\/v1\/shops\/s1\/bills\?/, { items: [], total: 0, next_cursor: null })])
  const view = renderApp('/billing')
  expect(await screen.findByText('No invoices found')).toBeInTheDocument()
  view.unmount()
  fakeApi([...SIGNED_IN, SHOP('staff'), ok('GET', /^\/v1\/shops\/s1\/bills\?/, { error: { message: 'Please try later' } }, 500)])
  renderApp('/billing')
  expect(await screen.findByRole('alert')).toHaveTextContent('Please try later')
})

test('a rejected bill can be corrected without keeping the cart locked', async () => {
  fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', { error: { code: 'overpayment', message: 'Only 189 is due' } }, 409)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText('Not paid yet'))
  await userEvent.click(screen.getByLabelText('Keep this balance unassigned'))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Only 189 is due')
  expect(screen.getByLabelText('Not paid yet')).toBeEnabled()
})

for (const action of ['payment', 'return'] as const) {
  test(`an uncertain ${action} retries the frozen request with the same key`, async () => {
    const endpoint = action === 'payment' ? 'payments' : 'credit-note'
    const label = action === 'payment' ? 'Record payment' : 'Return items'
    const calls = fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/bills/b1', detail), ok('POST', '/v1/shops/s1/bills/b1/credit-note/preview', returnReview), ok('POST', `/v1/shops/s1/bills/b1/${endpoint}`, { error: { message: 'Connection interrupted' } }, 503)])
    renderApp('/billing/b1')
    await userEvent.click(await screen.findByRole('button', { name: label }))
    const dialog = screen.getByRole('dialog')
    if (action === 'return') {
      await userEvent.type(within(dialog).getByLabelText('Return Rice'), '0.5')
      await userEvent.type(within(dialog).getByLabelText('Reason for the return'), 'Damaged')
      await waitFor(() => expect(within(dialog).getByRole('button', { name: label })).toBeEnabled())
    }
    await userEvent.click(within(dialog).getByRole('button', { name: label }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Details are locked')
    expect(within(dialog).getByLabelText(action === 'payment' ? 'Amount (₹)' : 'Return Rice')).toBeDisabled()
    expect(within(dialog).getAllByRole('button', { name: /^(Close|Cancel)$/ }).every(b => b.hasAttribute('disabled'))).toBe(true)
    await userEvent.click(within(dialog).getByRole('button', { name: `Retry ${action}` }))
    const writes = calls.filter(c => c.path.endsWith(`/${endpoint}`))
    expect(writes).toHaveLength(2)
    expect(writes[0]!.body).toEqual(writes[1]!.body)
    expect(writes[0]!.headers.get('Idempotency-Key')).toBeTruthy()
    expect(writes[0]!.headers.get('Idempotency-Key')).toBe(writes[1]!.headers.get('Idempotency-Key'))
  })
}

test('an idempotency conflict keeps the original bill request locked for safe retry', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', { error: { code: 'idempotency_conflict', message: 'Request conflict' } }, 409)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText('Not paid yet'))
  await userEvent.click(screen.getByLabelText('Keep this balance unassigned'))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('cart is locked')
  expect(screen.getByLabelText('Quantity for Rice')).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Retry saving invoice' }))
  const writes = calls.filter(c => c.path === '/v1/shops/s1/bills')
  expect(writes).toHaveLength(2)
  expect(writes[0]!.headers.get('Idempotency-Key')).toBe(writes[1]!.headers.get('Idempotency-Key'))
})

test('clearing bill filters restores the unfiltered request', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ok('GET', /^\/v1\/shops\/s1\/bills\?/, { items: [bill], total: 1, next_cursor: null })])
  renderApp('/billing')
  await screen.findByRole('link', { name: bill.bill_number })
  await userEvent.selectOptions(screen.getByLabelText('Payment status'), 'unpaid')
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  await waitFor(() => {
    const last = [...calls].reverse().find(c => c.path.includes('/bills?'))!
    expect(new URLSearchParams(last.path.split('?')[1]).has('status')).toBe(false)
  })
  expect(screen.getByLabelText('Payment status')).toHaveValue('')
})

test('business invoices show the required tax details only when chosen', async () => {
  fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT])
  renderApp('/billing/new')
  await userEvent.click(await screen.findByRole('button', { name: 'Add customer' }))
  expect(screen.queryByLabelText('GSTIN')).not.toBeInTheDocument()
  await userEvent.click(screen.getByLabelText('Business (GST invoice)'))
  expect(screen.getByLabelText('GSTIN')).toBeRequired()
})

test('an owner can bill an item that is not in the product list, with its own GST rate', async () => {
  const priced = { ...preview, total: '118.00', lines: [{ product_uuid: null, name: 'Gift wrap', quantity: '2', unit_price: '59.00', taxable_value: '100.00', gst: '18.00', amount: '118.00' }] }
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', priced), ok('POST', '/v1/shops/s1/bills', detail), ok('GET', '/v1/shops/s1/bills/b1', detail)])
  renderApp('/billing/new')
  await userEvent.click(await screen.findByRole('button', { name: '+ Item not in the list' }))
  const dialog = screen.getByRole('dialog', { name: 'Item not in the product list' })
  await userEvent.type(within(dialog).getByLabelText('Item name'), 'Gift wrap')
  await userEvent.type(within(dialog).getByLabelText('Price (₹)'), '59')
  await userEvent.clear(within(dialog).getByLabelText('Quantity'))
  await userEvent.type(within(dialog).getByLabelText('Quantity'), '2')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Add to invoice' }))
  expect(within(dialog).getByText('Choose the GST rate (0% if none).')).toBeInTheDocument()
  await userEvent.selectOptions(within(dialog).getByLabelText('GST rate'), '18')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Add to invoice' }))
  const row = (await screen.findByText('Gift wrap')).closest('tr')!
  expect(await within(row).findByText('₹118.00')).toBeInTheDocument()
  expect(within(row).getByText('Not in the list · GST 18%')).toBeInTheDocument()
  await userEvent.click(screen.getByLabelText(/^Paid in full/))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  await screen.findByText(bill.bill_number)
  expect(calls.find(c => c.path === '/v1/shops/s1/bills')?.body).toMatchObject({ items: [{ name: 'Gift wrap', quantity: '2', unit_price: '59', gst_percent: '18', cost: null }] })
})

test('staff do not get the option to bill items outside the product list', async () => {
  fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT])
  renderApp('/billing/new')
  await screen.findByLabelText('Scan barcode or search products')
  expect(screen.queryByRole('button', { name: '+ Item not in the list' })).not.toBeInTheDocument()
})

test('scanning a product again adds one more to the same line', async () => {
  fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview)])
  renderApp('/billing/new')
  await addRice()
  await scan('8901')
  await waitFor(() => expect(screen.getByLabelText('Quantity for Rice')).toHaveValue(2))
  expect(screen.getAllByLabelText(/^Quantity for/)).toHaveLength(1)
  expect(screen.getByLabelText('Scan barcode or search products')).toHaveFocus()
  expect(screen.getByText('Rice × 2')).toBeInTheDocument()
})

test('a code no product has is reported, never guessed, and offers the permitted ways forward', async () => {
  const none = ok('GET', /^\/v1\/shops\/s1\/products\/lookup\?code=000$/, { error: { code: 'no_such_code', message: 'No product has this barcode or code.' } }, 404)
  fakeApi([...SIGNED_IN, SHOP('owner'), none, ok('GET', /^\/v1\/shops\/s1\/products\?/, { items: [], next_cursor: null, total: 0 }), ok('GET', '/v1/shops/s1/categories', [])])
  renderApp('/billing/new')
  await scan('000')
  const note = await screen.findByText(/No product has the barcode or code/, { selector: '.unknown-code p' })
  expect(note).toHaveTextContent('000')
  expect(screen.getByRole('button', { name: 'Create product with this barcode' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add as item not in the list' })).toBeInTheDocument()
  expect(screen.queryByLabelText(/^Quantity for/)).not.toBeInTheDocument()
})

test('two products sharing a code is shown as a catalogue error', async () => {
  const clash = ok('GET', /^\/v1\/shops\/s1\/products\/lookup\?code=7$/, { error: { code: 'ambiguous_code', message: 'More than one product uses this barcode or code. Fix the catalogue.' } }, 409)
  fakeApi([...SIGNED_IN, SHOP('staff'), clash, ok('GET', '/v1/shops/s1/categories', [])])
  renderApp('/billing/new')
  await scan('7')
  expect(await screen.findByText(/More than one product uses this barcode or code/)).toBeInTheDocument()
  expect(screen.queryByLabelText(/^Quantity for/)).not.toBeInTheDocument()
})

test('asking for more than the stock shown warns on the line, and an out-of-stock product is not added', async () => {
  const tracked = { ...product, track_stock: true, quantity: '3', unit_name: 'kg' }
  const empty = { ...product, uuid: 'p2', name: 'Salt', barcode: '5555', track_stock: true, quantity: '0' }
  fakeApi([...SIGNED_IN, SHOP('staff'), ok('GET', /\/lookup\?code=8901$/, tracked), ok('GET', /\/lookup\?code=5555$/, empty), ok('GET', '/v1/shops/s1/categories', []), ok('POST', '/v1/shops/s1/bills/preview', preview)])
  renderApp('/billing/new')
  await scan('8901')
  const qty = await screen.findByLabelText('Quantity for Rice')
  expect(screen.getByText('3 kg in stock')).toBeInTheDocument()
  await userEvent.clear(qty)
  await userEvent.type(qty, '5')
  expect(screen.getByText('Only 3 kg in stock.')).toBeInTheDocument()
  await scan('5555')
  expect(await screen.findByText(/Salt is out of stock/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Quantity for Salt')).not.toBeInTheDocument()
})

test('Enter on an empty scan box moves to payment, and cash received shows the change', async () => {
  fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.type(screen.getByLabelText('Scan barcode or search products'), '{Enter}')
  await waitFor(() => expect(screen.getByLabelText('Paid in full')).toHaveFocus())
  await userEvent.keyboard(' ')
  await userEvent.type(await screen.findByLabelText('Cash received'), '200')
  expect(await screen.findByText('₹11.00')).toBeInTheDocument()
  expect(screen.getByText(/Change to return/)).toBeInTheDocument()
})

test('unassigned credit requires a deliberate choice before saving', async () => {
  fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText('Not paid yet'))
  const create = screen.getByRole('button', { name: /^Create invoice/ })
  const unassigned = await screen.findByLabelText('Keep this balance unassigned')
  expect(create).toBeDisabled()
  await userEvent.click(unassigned)
  await waitFor(() => expect(create).toBeEnabled())
  await userEvent.click(screen.getByLabelText('Paid in full'))
  await userEvent.click(screen.getByLabelText('Not paid yet'))
  expect(screen.getByLabelText('Keep this balance unassigned')).not.toBeChecked()
  expect(create).toBeDisabled()
})

test('a saved invoice shows what was recorded and the three next steps', async () => {
  const part = { ...detail, bill: { ...bill, total_amount: '189.00', paid_amount: '100.00', balance_due: '89.00' } }
  fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', part)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText('Part paid'))
  await userEvent.type(screen.getByLabelText(/^Paid now/), '100')
  await userEvent.click(screen.getByLabelText('Keep this balance unassigned'))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  expect(await screen.findByRole('heading', { name: 'Invoice saved' })).toBeInTheDocument()
  expect(screen.getByText('₹89.00')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Print' })).toHaveAttribute('href', '/billing/b1?print=1')
  expect(screen.getByRole('link', { name: 'View invoice' })).toHaveAttribute('href', '/billing/b1')
  await userEvent.click(screen.getByRole('button', { name: 'New invoice' }))
  expect(await screen.findByLabelText('Scan barcode or search products')).toHaveFocus()
  expect(screen.queryByLabelText('Quantity for Rice')).not.toBeInTheDocument()
  await addRice()
  for (const label of ['Paid in full', 'Part paid', 'Not paid yet']) expect(screen.getByLabelText(label)).not.toBeChecked()
})

test('a business invoice explains it needs the GSTIN instead of asking the server to price it', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview)])
  renderApp('/billing/new')
  await addRice()
  await waitFor(() => expect(calls.some(c => c.path.endsWith('/bills/preview'))).toBe(true))
  const before = calls.filter(c => c.path.endsWith('/bills/preview')).length
  await userEvent.click(screen.getByRole('button', { name: 'Add customer' }))
  await userEvent.click(screen.getByLabelText('Business (GST invoice)'))
  expect(await screen.findByText(/needs the customer's GSTIN before it can be priced/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeDisabled()
  await new Promise(r => setTimeout(r, 400))
  expect(calls.filter(c => c.path.endsWith('/bills/preview')).length).toBe(before)
})


/** Calls that could change something on the server (signing in aside). */
const writes = (calls: { method: string; path: string }[]) => calls.filter(c => c.method !== 'GET' && !c.path.startsWith('/v1/auth/'))
const withMore = (body: object = detail) => [...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/bills/b1', body), ok('GET', '/v1/shops/s1/invoice-settings', { paper_size: 'A4', show: {}, invoice_title: 'TAX INVOICE', gst_scheme: 'regular', shop_name: 'Asha Stores', shop_address: '', shop_phone: '', shop_email: '', upi_id: '', shop_logo: null, digital_signature: null })]

test('voiding sits under More actions, shows its impact, and needs a reason', async () => {
  const paid = { ...detail, bill: { ...bill, paid_amount: '100.00', balance_due: '89.00' } }
  const calls = fakeApi([...withMore(paid), ok('POST', '/v1/shops/s1/bills/b1/cancel', { ...detail, bill: { ...bill, cancelled: true, cancel_reason: 'Wrong customer' } })])
  renderApp('/billing/b1')
  // Not in the routine row: it is behind the More actions menu.
  expect(screen.queryByRole('button', { name: /Cancel/ })).not.toBeInTheDocument()
  await userEvent.click(await screen.findByText('More actions'))
  await userEvent.click(screen.getByRole('button', { name: 'Void invoice' }))
  const dialog = screen.getByRole('dialog')
  const impact = within(dialog).getByRole('region', { name: 'What voiding does' })
  expect(impact).toHaveTextContent('stay on record as voided')
  expect(impact).toHaveTextContent('Stock for 1 product goes back to the shelf')
  expect(impact).toHaveTextContent('₹100.00 of recorded payments')
  expect(impact).toHaveTextContent('Storely does not refund money')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Void invoice' }))
  expect(await within(dialog).findByText(/reason/i, { selector: '.field-error' })).toBeInTheDocument()
  expect(calls.some(c => c.path.endsWith('/cancel'))).toBe(false)
  await userEvent.type(within(dialog).getByLabelText('Reason for voiding'), 'Wrong customer')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Void invoice' }))
  await waitFor(() => expect(calls.find(c => c.path.endsWith('/cancel'))?.body).toEqual({ reason: 'Wrong customer' }))
})

test('an invoice with a credit note cannot be voided until the note is', async () => {
  fakeApi(withMore({ ...detail, credit_notes: [{ uuid: 'c1', bill_number: 'CN/1', total_amount: '-10.00', created_at: '2026-10-27T10:00:00' }] }))
  renderApp('/billing/b1')
  await userEvent.click(await screen.findByText('More actions'))
  await userEvent.click(screen.getByRole('button', { name: 'Void invoice' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Void it first')
  expect(within(dialog).getByRole('button', { name: 'Void invoice' })).toBeDisabled()
})

test('a credit note says what happened to the money instead of Paid', async () => {
  const note = { ...detail, bill: { ...bill, document_type: 'credit_note', bill_number: 'CN/1', total_amount: '-105.00', payment_status: 'unpaid', original_bill_number: 'INV/2627/A0001', original_bill_uuid: 'b0' }, payments: [{ uuid: 'p1', amount: '-105.00', payment_method: 'cash', payment_reference: null, notes: 'Refund', received_at: '2026-10-27T10:00:00' }], history: [{ action: 'created', actor: 'Asha', details: 'Return against INV/2627/A0001', created_at: '2026-10-27T10:00:00' }] }
  fakeApi(withMore(note))
  renderApp('/billing/b1')
  expect(await screen.findByText('Refunded')).toBeInTheDocument()
  expect(screen.queryByText('Paid')).not.toBeInTheDocument()
  expect(screen.getByText('by Asha', { exact: false })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Return items' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'INV/2627/A0001' })).toHaveAttribute('href', '/billing/b0')
})

test('sharing on WhatsApp is reviewed first, opens a chat only when asked, and cancelling does nothing', async () => {
  const open = vi.fn()
  vi.stubGlobal('open', open)
  const calls = fakeApi(withMore({ ...detail, bill: { ...bill, customer_phone: '98765 43210' } }))
  renderApp('/billing/b1')
  await userEvent.click(await screen.findByRole('button', { name: 'Share on WhatsApp' }))
  let dialog = screen.getByRole('dialog')
  expect(within(dialog).getByLabelText('Send to')).toHaveValue('98765 43210')
  expect((within(dialog).getByLabelText('Message') as HTMLTextAreaElement).value).toContain('INV/2627/A0001')
  expect(within(dialog).getByText(/cannot attach the invoice/)).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(open).not.toHaveBeenCalled()
  expect(writes(calls)).toHaveLength(0)
  await userEvent.click(screen.getByRole('button', { name: 'Share on WhatsApp' }))
  dialog = screen.getByRole('dialog')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Open WhatsApp' }))
  expect(open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/wa\.me\/919876543210\?text=/), '_blank', 'noopener,noreferrer')
  expect(within(dialog).getByText(/cannot see whether you sent/)).toBeInTheDocument()
  expect(writes(calls)).toHaveLength(0)
})

test('a missing or unusable phone number is asked for, not guessed', async () => {
  const open = vi.fn()
  vi.stubGlobal('open', open)
  fakeApi(withMore())
  renderApp('/billing/b1')
  await userEvent.click(await screen.findByRole('button', { name: 'Share on WhatsApp' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText(/no phone number/)).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Open WhatsApp' }))
  expect(await within(dialog).findByText(/with its country code/)).toBeInTheDocument()
  expect(open).not.toHaveBeenCalled()
})

test('the paper chosen for one print does not change the saved paper', async () => {
  const calls = fakeApi(withMore())
  renderApp('/billing/b1')
  await screen.findByText('This is your shop’s saved paper.')
  await userEvent.selectOptions(screen.getByLabelText('Paper size'), '80mm')
  expect(screen.getByText(/For this print or PDF only/)).toHaveTextContent('Your saved paper stays A4')
  expect(writes(calls)).toHaveLength(0)
})

test('the PDF is asked for with the chosen paper, saved under the invoice number, and changes nothing', async () => {
  const created = vi.fn(() => 'blob:pdf')
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }))
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe('INV-2627-A0001.pdf') })
  const calls = fakeApi([...withMore(), ok('GET', /\/bills\/b1\/pdf\?paper=80mm$/, '%PDF-1.7')])
  renderApp('/billing/b1')
  await screen.findByText('This is your shop’s saved paper.')
  await userEvent.selectOptions(screen.getByLabelText('Paper size'), '80mm')
  await userEvent.click(screen.getByRole('button', { name: 'Download PDF' }))
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
  expect(created).toHaveBeenCalledTimes(1)
  expect(calls.filter(c => c.path.includes('/pdf')).map(c => c.path)).toEqual(['/v1/shops/s1/bills/b1/pdf?paper=80mm'])
  expect(writes(calls)).toHaveLength(0)
  click.mockRestore()
})

test('a PDF that cannot be made says so and can be tried again', async () => {
  fakeApi([...withMore(), ok('GET', /\/pdf\?paper=A4$/, { error: { code: 'rate_limited', message: 'Too many requests. Please wait and try again.' } }, 429)])
  renderApp('/billing/b1')
  await userEvent.click(await screen.findByRole('button', { name: 'Download PDF' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests')
  expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled()
})

test('a voided invoice shows no balance and asks for no payment', async () => {
  const voided = { ...detail, bill: { ...bill, cancelled: true, cancel_reason: 'Wrong customer', paid_amount: '0.00', balance_due: '189.00' } }
  fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/bills/b1', voided), ok('GET', '/v1/shops/s1/invoice-settings', { paper_size: 'A4', show: { show_upi_qr: true }, invoice_title: 'TAX INVOICE', gst_scheme: 'regular', shop_name: 'Asha Stores', shop_address: '', shop_phone: '', shop_email: '', upi_id: 'asha@okaxis', shop_logo: null, digital_signature: null })])
  renderApp('/billing/b1')
  const sheet = await screen.findByLabelText('Invoice')
  expect(within(sheet).getByText(/VOID/)).toBeInTheDocument()
  expect(within(sheet).queryByText('Balance due')).not.toBeInTheDocument()
  expect(within(sheet).queryByRole('img', { name: /UPI QR/ })).not.toBeInTheDocument()
})

test('an unpaid invoice that is still live does ask for payment by UPI', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/bills/b1', detail), ok('GET', '/v1/shops/s1/invoice-settings', { paper_size: 'A4', show: { show_upi_qr: true }, invoice_title: 'TAX INVOICE', gst_scheme: 'regular', shop_name: 'Asha Stores', shop_address: '', shop_phone: '', shop_email: '', upi_id: 'asha@okaxis', shop_logo: null, digital_signature: null })])
  renderApp('/billing/b1')
  const sheet = await screen.findByLabelText('Invoice')
  expect(await within(sheet).findByRole('img', { name: /UPI QR/ })).toBeInTheDocument()
  expect(within(sheet).getByText('Balance due')).toBeInTheDocument()
})

test('invoice list filters live in the address, so going back keeps them', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ok('GET', /^\/v1\/shops\/s1\/bills\?/, { items: [bill], total: 1, next_cursor: null })])
  renderApp('/billing?status=unpaid&voided=1')
  await screen.findByRole('link', { name: bill.bill_number })
  expect(screen.getByLabelText('Payment status')).toHaveValue('unpaid')
  expect(screen.getByLabelText('Voided invoices')).toBeChecked()
  expect(screen.getByRole('link', { name: bill.bill_number })).toHaveAttribute('href', '/billing/b1')
  expect(calls.some(c => c.path.includes('status=unpaid') && c.path.includes('cancelled=true'))).toBe(true)
})

test('invoice sending waits for durable storage and a storage failure never sends', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', detail)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText(/^Paid in full/))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  const original = Storage.prototype.setItem
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key.startsWith('storely.draft.bill.') && JSON.parse(value).data.attempt) throw new DOMException('Quota', 'QuotaExceededError')
    original.call(this, key, value)
  })
  try {
    await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
    expect(await screen.findByText(/This attempt has not been sent/)).toBeInTheDocument()
    expect(calls.filter(c => c.path === '/v1/shops/s1/bills')).toHaveLength(0)
    expect(screen.getByLabelText('Quantity for Rice')).toBeEnabled()
  } finally { storage.mockRestore() }
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  await screen.findByText(bill.bill_number)
  expect(calls.filter(c => c.path === '/v1/shops/s1/bills')).toHaveLength(1)
})

test('a cross-tab draft change blocks invoice creation instead of replacing it', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText(/^Paid in full/))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  const key = 'storely.draft.bill.u1.s1'
  const otherTab = localStorage.getItem(key)!.replace('"discount":"0"', '"discount":"5"')
  localStorage.setItem(key, otherTab)
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  expect(await screen.findByText(/draft changed in another tab/)).toBeInTheDocument()
  expect(screen.getByLabelText('Quantity for Rice')).toBeDisabled()
  expect(localStorage.getItem(key)).toBe(otherTab)
  expect(calls.filter(c => c.path === '/v1/shops/s1/bills')).toHaveLength(0)
})

test('an unclassified request conflict keeps the exact operation frozen for retry', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', { error: { code: 'request_conflict', message: 'Check this request' } }, 409)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText(/^Paid in full/))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  expect(await screen.findByRole('button', { name: 'Retry saving invoice' })).toBeEnabled()
  expect(screen.getByLabelText('Quantity for Rice')).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Retry saving invoice' }))
  const writes = calls.filter(c => c.path === '/v1/shops/s1/bills')
  expect(writes).toHaveLength(2)
  expect(writes[0]!.body).toEqual(writes[1]!.body)
  expect(writes[0]!.headers.get('Idempotency-Key')).toBe(writes[1]!.headers.get('Idempotency-Key'))
})

test('a network call sees the exact persisted body and key before invoice creation', async () => {
  let durable: { attempt: { key: string; body: unknown } } | undefined
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', () => {
    durable = JSON.parse(localStorage.getItem('storely.draft.bill.u1.s1')!).data
    return detail
  })])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText(/^Paid in full/))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  await screen.findByText(bill.bill_number)
  const write = calls.find(c => c.path === '/v1/shops/s1/bills')!
  expect(durable?.attempt.body).toEqual(write.body)
  expect(durable?.attempt.key).toBe(write.headers.get('Idempotency-Key'))
})

test('malformed recovery data fails closed without a render crash or new invoice', async () => {
  localStorage.setItem('storely.draft.bill.u1.s1', JSON.stringify({ v: 1, savedAt: Date.now(), data: { attempt: { key: 'possibly-sent', body: {} }, items: 'broken' } }))
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT])
  renderApp('/billing/new')
  expect(await screen.findByText(/saved invoice could not be read/)).toBeInTheDocument()
  expect(screen.getByLabelText('Scan barcode or search products')).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Discard draft' })).not.toBeInTheDocument()
  expect(calls.filter(c => c.path === '/v1/shops/s1/bills')).toHaveLength(0)
})

test('successful save with failed draft cleanup cannot start a fresh invoice until cleanup works', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', detail)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText(/^Paid in full/))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  const original = Storage.prototype.removeItem
  const storage = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key) {
    if (key.startsWith('storely.draft.bill.')) throw new DOMException('Blocked', 'SecurityError')
    original.call(this, key)
  })
  try {
    await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
    await screen.findByRole('heading', { name: 'Invoice saved' })
    await userEvent.click(screen.getByRole('button', { name: 'New invoice' }))
    expect(screen.getByRole('heading', { name: 'Invoice saved' })).toBeInTheDocument()
    expect(screen.getByText(/draft could not be cleared/)).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('storely.draft.bill.u1.s1')!).data.attempt.key).toBeTruthy()
  } finally { storage.mockRestore() }
  await userEvent.click(screen.getByRole('button', { name: 'New invoice' }))
  await screen.findByLabelText('Scan barcode or search products')
  expect(localStorage.getItem('storely.draft.bill.u1.s1')).toBeNull()
  expect(calls.filter(c => c.path === '/v1/shops/s1/bills')).toHaveLength(1)
})

test('a browser without Web Locks cannot send an invoice', async () => {
  const original = navigator
  vi.stubGlobal('navigator', new Proxy(original, { get: (target, key) => key === 'locks' ? undefined : Reflect.get(target, key, target) }))
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText(/^Paid in full/))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  expect(await screen.findByText(/Web Locks on HTTPS or localhost/)).toBeInTheDocument()
  expect(calls.filter(c => c.path === '/v1/shops/s1/bills')).toHaveLength(0)
})

test('leaving checkout while its save lock is queued never sends from the old page', async () => {
  const locks = installInvoiceLocks()
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview)])
  const view = renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText(/^Paid in full/))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  let release!: () => void
  let entered!: () => void
  const ready = new Promise<void>(resolve => { entered = resolve })
  const held = locks.request('storely.draft.bill.u1.s1', () => new Promise<void>(resolve => { release = resolve; entered() }))
  await ready
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  view.unmount()
  release()
  await held
  await waitFor(() => expect(JSON.parse(localStorage.getItem('storely.draft.bill.u1.s1')!).data.attempt).toBeNull())
  expect(calls.filter(c => c.path === '/v1/shops/s1/bills')).toHaveLength(0)
})

for (const restored of [false, true]) {
  for (const [status, code] of [[422, 'bad_quantity'], [409, 'overpayment'], [409, 'no_free_number'], [409, 'checkout_changed']] as const) {
    test(`a lost acknowledgement followed by ${status} ${code} stays frozen${restored ? ' after reload' : ''}`, async () => {
      let count = 0
      const response = ok('POST', '/v1/shops/s1/bills', () => {
        count++
        response.status = status
        return { error: count === 1 ? { code: 'network', message: 'Connection interrupted' } : { code, message: 'Retry rejected' } }
      }, 503)
      const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview), response])
      const first = renderApp('/billing/new')
      await addRice()
      await userEvent.click(screen.getByLabelText(/^Paid in full/))
      await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
      await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
      await screen.findByText(/Connection interrupted/)
      const frozen = JSON.parse(localStorage.getItem('storely.draft.bill.u1.s1')!).data.attempt
      if (restored) { first.unmount(); renderApp('/billing/new') }
      await userEvent.click(await screen.findByRole('button', { name: 'Retry saving invoice' }))
      expect(await screen.findByText(/Retry rejected/)).toHaveTextContent('cart is locked')
      expect(screen.getByLabelText('Quantity for Rice')).toBeDisabled()
      expect(screen.getByLabelText(/^Paid in full/)).toBeDisabled()
      expect(screen.queryByRole('button', { name: 'Discard draft' })).not.toBeInTheDocument()
      expect(JSON.parse(localStorage.getItem('storely.draft.bill.u1.s1')!).data.attempt).toEqual(frozen)
      await userEvent.click(screen.getByRole('button', { name: 'Retry saving invoice' }))
      const writes = calls.filter(c => c.path === '/v1/shops/s1/bills')
      expect(writes).toHaveLength(3)
      for (const write of writes) {
        expect(write.body).toEqual(frozen.body)
        expect(write.headers.get('Idempotency-Key')).toBe(frozen.key)
      }
    })
  }
}

test('a first fresh 422 durably releases the attempt and allows a corrected invoice with a new key', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', { error: { code: 'bad_quantity', message: 'Check quantity' } }, 422)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText(/^Paid in full/))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  expect(await screen.findByText(/Check quantity/)).toHaveTextContent('Check your cart')
  expect(screen.getByLabelText('Quantity for Rice')).toBeEnabled()
  expect(JSON.parse(localStorage.getItem('storely.draft.bill.u1.s1')!).data.attempt).toBeNull()
  await userEvent.clear(screen.getByLabelText('Quantity for Rice'))
  await userEvent.type(screen.getByLabelText('Quantity for Rice'), '2')
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  await screen.findByText(/Check quantity/)
  const writes = calls.filter(c => c.path === '/v1/shops/s1/bills')
  expect(writes).toHaveLength(2)
  expect(writes[0]!.headers.get('Idempotency-Key')).not.toBe(writes[1]!.headers.get('Idempotency-Key'))
  expect(writes[1]!.body).toMatchObject({ items: [{ product_uuid: 'p1', quantity: '2' }] })
})

for (const invalid of ['', 'bad', '-1', '0', '189', '190', '1.001']) {
  test(`partial settlement rejects ${JSON.stringify(invalid)} without sending or losing input`, async () => {
    const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview)])
    renderApp('/billing/new')
    await addRice()
    await userEvent.click(screen.getByLabelText('Part paid'))
    const amount = screen.getByLabelText(/^Paid now/)
    if (invalid) await userEvent.type(amount, invalid)
    await userEvent.click(screen.getByLabelText('Keep this balance unassigned'))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Enter the amount paid now|Paid now is required/)
    expect(amount).toHaveValue(invalid)
    expect(screen.getByLabelText('Part paid')).toBeChecked()
    expect(calls.filter(c => c.path === '/v1/shops/s1/bills')).toHaveLength(0)
  })
}

test('changing partial settlement amount or method requires fresh unassigned consent', async () => {
  fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText('Part paid'))
  await userEvent.type(screen.getByLabelText(/^Paid now/), '10')
  await userEvent.click(screen.getByLabelText('Keep this balance unassigned'))
  await userEvent.type(screen.getByLabelText(/^Paid now/), '0')
  expect(screen.getByLabelText('Keep this balance unassigned')).not.toBeChecked()
  await userEvent.click(screen.getByLabelText('Keep this balance unassigned'))
  await userEvent.selectOptions(screen.getByLabelText('Paid by'), 'upi')
  expect(screen.getByLabelText('Keep this balance unassigned')).not.toBeChecked()
  expect(screen.getByLabelText(/^Paid now/)).toHaveValue('100')
})

test('changed authoritative preview requires settlement review and retains entered fields', async () => {
  let changed = false
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', () => changed ? { ...preview, reviewed_context: `br1:${'b'.repeat(64)}`, total: '190.00', round_off_amount: '1.00' } : preview)])
  renderApp('/billing/new')
  await addRice()
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByLabelText('Part paid'))
  await userEvent.type(screen.getByLabelText(/^Paid now/), '100')
  await userEvent.selectOptions(screen.getByLabelText('Paid by'), 'upi')
  await userEvent.type(screen.getByLabelText('Reference'), 'UPI-keep')
  await userEvent.click(screen.getByLabelText('Keep this balance unassigned'))
  changed = true
  act(() => { focusManager.setFocused(false); focusManager.setFocused(true) })
  expect(await screen.findByRole('alert')).toHaveTextContent('Review the updated invoice amounts')
  expect(screen.getByLabelText('Part paid')).not.toBeChecked()
  expect(screen.getByLabelText('Paid in full')).not.toBeChecked()
  await userEvent.click(screen.getByLabelText('Part paid'))
  expect(screen.getByLabelText(/^Paid now/)).toHaveValue('100')
  expect(screen.getByLabelText('Reference')).toHaveValue('UPI-keep')
  expect(screen.getByLabelText('Keep this balance unassigned')).not.toBeChecked()
  expect(calls.filter(c => c.path === '/v1/shops/s1/bills')).toHaveLength(0)
})
test('a settings-only reviewed-context change requires settlement review and retains entered fields', async () => {
  let changed = false
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', () => changed ? { ...preview, reviewed_context: `br1:${'b'.repeat(64)}` } : preview)])
  renderApp('/billing/new')
  await addRice()
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByLabelText('Part paid'))
  await userEvent.type(screen.getByLabelText(/^Paid now/), '100')
  await userEvent.selectOptions(screen.getByLabelText('Paid by'), 'upi')
  await userEvent.type(screen.getByLabelText('Reference'), 'UPI-keep')
  await userEvent.click(screen.getByLabelText('Keep this balance unassigned'))
  changed = true
  act(() => { focusManager.setFocused(false); focusManager.setFocused(true) })
  expect(await screen.findByRole('alert')).toHaveTextContent('Review the updated invoice amounts')
  expect(screen.getByLabelText('Part paid')).not.toBeChecked()
  expect(screen.getByLabelText('Paid in full')).not.toBeChecked()
  await userEvent.click(screen.getByLabelText('Part paid'))
  expect(screen.getByLabelText(/^Paid now/)).toHaveValue('100')
  expect(screen.getByLabelText('Reference')).toHaveValue('UPI-keep')
  expect(screen.getByLabelText('Keep this balance unassigned')).not.toBeChecked()
  expect(calls.filter(c => c.path === '/v1/shops/s1/bills')).toHaveLength(0)
})

for (const reviewed_context of [undefined, 'br2:' + 'a'.repeat(64), 'br1:bad']) {
  test(`a fresh invoice fails closed for an unsupported review token ${reviewed_context}`, async () => {
    const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', { ...preview, reviewed_context })])
    renderApp('/billing/new')
    await addRice()
    await userEvent.click(screen.getByLabelText('Part paid'))
    await userEvent.type(screen.getByLabelText(/^Paid now/), '100')
    await userEvent.click(screen.getByLabelText('Keep this balance unassigned'))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot confirm the reviewed invoice')
    expect(screen.getByLabelText(/^Paid now/)).toHaveValue('100')
    expect(screen.getByLabelText('Part paid')).toBeChecked()
    expect(calls.filter(c => c.path === '/v1/shops/s1/bills')).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('storely.draft.bill.u1.s1')!).data.attempt).toBeNull()
  })
}

test('a fresh checkout conflict releases only the rejected attempt and requires review with retained payment fields', async () => {
  let changed = false
  const latest = { ...preview, reviewed_context: `br1:${'b'.repeat(64)}`, total: '190.00', round_off_amount: '1.00' }
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', () => changed ? latest : preview), ok('POST', '/v1/shops/s1/bills', () => { changed = true; return { error: { code: 'checkout_changed', message: 'Invoice settings changed' } } }, 409)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText('Part paid'))
  await userEvent.type(screen.getByLabelText(/^Paid now/), '100')
  await userEvent.selectOptions(screen.getByLabelText('Paid by'), 'upi')
  await userEvent.type(screen.getByLabelText('Reference'), 'KEEP-REF')
  await userEvent.click(screen.getByLabelText('Keep this balance unassigned'))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  await screen.findByText(/Invoice settings changed/)
  await waitFor(() => expect(screen.getByLabelText('Part paid')).not.toBeChecked())
  expect(screen.getByLabelText('Quantity for Rice')).toBeEnabled()
  expect(JSON.parse(localStorage.getItem('storely.draft.bill.u1.s1')!).data.attempt).toBeNull()
  await waitFor(() => expect(calls.filter(c => c.path.endsWith('/bills/preview')).length).toBeGreaterThan(1))
  await userEvent.click(screen.getByLabelText('Part paid'))
  expect(screen.getByLabelText(/^Paid now/)).toHaveValue('100')
  expect(screen.getByLabelText('Reference')).toHaveValue('KEEP-REF')
  expect(screen.getByLabelText('Keep this balance unassigned')).not.toBeChecked()
  await userEvent.click(screen.getByLabelText('Keep this balance unassigned'))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  const writes = calls.filter(c => c.path === '/v1/shops/s1/bills')
  expect(writes).toHaveLength(2)
  expect(writes[0]!.body).toMatchObject({ settlement_choice: 'partial', reviewed_context: preview.reviewed_context })
  expect(writes[1]!.body).toMatchObject({ settlement_choice: 'partial', reviewed_context: latest.reviewed_context, payment: { amount: '100', method: 'upi', reference: 'KEEP-REF' } })
  expect(writes[0]!.headers.get('Idempotency-Key')).not.toBe(writes[1]!.headers.get('Idempotency-Key'))
})

test('a restored legacy uncertain invoice retries its exact body without adding new settlement fields', async () => {
  fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', { error: { code: 'network', message: 'Lost response' } }, 503)])
  const first = renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText('Paid in full'))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  await screen.findByText(/Lost response/)
  first.unmount()
  const key = 'storely.draft.bill.u1.s1'
  const draft = JSON.parse(localStorage.getItem(key)!)
  delete draft.data.attempt.body.settlement_choice
  delete draft.data.attempt.body.reviewed_context
  localStorage.setItem(key, JSON.stringify(draft))
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills', detail)])
  renderApp('/billing/new')
  await userEvent.click(await screen.findByRole('button', { name: 'Retry saving invoice' }))
  await screen.findByRole('heading', { name: 'Invoice saved' })
  const write = calls.find(c => c.path === '/v1/shops/s1/bills')!
  expect(write.body).toEqual(draft.data.attempt.body)
  expect(write.headers.get('Idempotency-Key')).toBe(draft.data.attempt.key)
  expect(calls.filter(c => c.path.endsWith('/bills/preview'))).toHaveLength(0)
})

test('checkout reload retains raw partial fields, cash and same-context unassigned consent', async () => {
  fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview)])
  const first = renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText('Paid in full'))
  await userEvent.type(screen.getByLabelText('Cash received'), 'two notes')
  await userEvent.click(screen.getByLabelText('Part paid'))
  await userEvent.type(screen.getByLabelText(/^Paid now/), 'bad raw amount')
  await userEvent.selectOptions(screen.getByLabelText('Paid by'), 'upi')
  await userEvent.type(screen.getByLabelText('Reference'), 'KEEP-RAW')
  await userEvent.click(screen.getByLabelText('Keep this balance unassigned'))
  await waitFor(() => expect(JSON.parse(localStorage.getItem('storely.draft.bill.u1.s1')!).data.allowUnassigned).toBe(true))
  first.unmount()
  renderApp('/billing/new')
  expect(await screen.findByLabelText(/^Paid now/)).toHaveValue('bad raw amount')
  expect(screen.getByLabelText('Reference')).toHaveValue('KEEP-RAW')
  await waitFor(() => expect(screen.getByLabelText('Keep this balance unassigned')).toBeChecked())
  await userEvent.click(screen.getByLabelText('Paid in full'))
  await userEvent.selectOptions(screen.getByLabelText('Paid by'), 'cash')
  expect(screen.getByLabelText('Cash received')).toHaveValue('two notes')
})

test('reload with changed reviewed context retains input but renews settlement and consent', async () => {
  let changed = false
  fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', () => ({ ...preview, reviewed_context: `br1:${(changed ? 'b' : 'a').repeat(64)}` }))])
  const first = renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText('Part paid'))
  await userEvent.type(screen.getByLabelText(/^Paid now/), '100')
  await userEvent.click(screen.getByLabelText('Keep this balance unassigned'))
  await waitFor(() => expect(JSON.parse(localStorage.getItem('storely.draft.bill.u1.s1')!).data.allowUnassigned).toBe(true))
  first.unmount()
  changed = true
  renderApp('/billing/new')
  await screen.findByText(/Review the updated invoice amounts/)
  expect(screen.getByLabelText('Part paid')).not.toBeChecked()
  await userEvent.click(screen.getByLabelText('Part paid'))
  expect(screen.getByLabelText(/^Paid now/)).toHaveValue('100')
  expect(screen.getByLabelText('Keep this balance unassigned')).not.toBeChecked()
  expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeDisabled()
})

test('hold and resume swap complete checkout drafts without overwriting the current cart', async () => {
  fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('GET', /^\/v1\/shops\/s1\/customers\?/, []), ok('POST', '/v1/shops/s1/bills/preview', preview)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByRole('button', { name: 'Add customer' }))
  await userEvent.type(screen.getByLabelText('Name'), 'A')
  await userEvent.click(screen.getByRole('button', { name: 'Done' }))
  await userEvent.click(screen.getByLabelText('Part paid'))
  await userEvent.type(screen.getByLabelText(/^Paid now/), '100')
  await userEvent.selectOptions(screen.getByLabelText('Paid by'), 'upi')
  await userEvent.type(screen.getByLabelText('Reference'), 'A-REF')
  await userEvent.click(screen.getByLabelText('Keep this balance unassigned'))
  await userEvent.click(screen.getByRole('button', { name: 'Hold invoice' }))
  const held = await screen.findByRole('region', { name: 'Held invoices' })
  expect(within(held).getByText('A')).toBeInTheDocument()
  expect(screen.queryByLabelText('Quantity for Rice')).not.toBeInTheDocument()
  await addRice()
  await userEvent.click(screen.getByRole('button', { name: 'Add customer' }))
  await userEvent.type(screen.getByLabelText('Name'), 'B')
  await userEvent.click(screen.getByRole('button', { name: 'Done' }))
  await userEvent.click(screen.getByLabelText('Paid in full'))
  await userEvent.type(screen.getByLabelText('Cash received'), '300')
  await userEvent.click(within(screen.getByRole('region', { name: 'Held invoices' })).getByRole('button', { name: 'Resume held invoice' }))
  expect(await screen.findByLabelText(/^Paid now/)).toHaveValue('100')
  expect(screen.getByLabelText('Reference')).toHaveValue('A-REF')
  await waitFor(() => expect(screen.getByLabelText('Keep this balance unassigned')).toBeChecked())
  const swapped = within(screen.getByRole('region', { name: 'Held invoices' }))
  expect(swapped.getByText('B')).toBeInTheDocument()
  expect(swapped.queryByText('A')).not.toBeInTheDocument()
  expect(swapped.getAllByRole('listitem')).toHaveLength(1)
  await userEvent.click(swapped.getByRole('button', { name: 'Discard held invoice' }))
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Held invoices' })).not.toBeInTheDocument())
  expect(screen.getByLabelText(/^Paid now/)).toHaveValue('100')
})

test('failed hold keeps the current checkout fields and succeeds on explicit retry', async () => {
  fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText('Paid in full'))
  await userEvent.type(screen.getByLabelText('Cash received'), '200')
  const original = Storage.prototype.setItem
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key.startsWith('storely.draft.bill.') && JSON.parse(value).held?.length) throw new DOMException('Quota', 'QuotaExceededError')
    original.call(this, key, value)
  })
  try {
    await userEvent.click(screen.getByRole('button', { name: 'Hold invoice' }))
    await screen.findByText(/could not be saved in this browser/)
    expect(screen.getByLabelText('Cash received')).toHaveValue('200')
    expect(screen.getByLabelText('Quantity for Rice')).toBeEnabled()
    expect(screen.queryByRole('region', { name: 'Held invoices' })).not.toBeInTheDocument()
  } finally { storage.mockRestore() }
  await userEvent.click(screen.getByRole('button', { name: 'Hold invoice' }))
  expect(await screen.findByRole('region', { name: 'Held invoices' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Quantity for Rice')).not.toBeInTheDocument()
})

test('an uncertain invoice cannot be held as an editable clone', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', { error: { code: 'network', message: 'Lost acknowledgement' } }, 503)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText('Paid in full'))
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  await screen.findByText(/Lost acknowledgement/)
  expect(screen.getByRole('button', { name: 'Hold invoice' })).toBeDisabled()
  expect(JSON.parse(localStorage.getItem('storely.draft.bill.u1.s1')!).held).toEqual([])
  expect(calls.filter(c => c.path === '/v1/shops/s1/bills')).toHaveLength(1)
})
