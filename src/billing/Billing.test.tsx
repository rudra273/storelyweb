import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { SIGNED_IN, fakeApi, ok, renderApp } from '../test-utils'

const SHOP = (role: string) => ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Asha Stores', role }])
const bill = { uuid: 'b1', bill_number: 'INV/2627/A0001', bill_type: 'b2c', document_type: 'invoice', customer_name: 'Ravi', customer_phone: null, customer_gstin: null, customer_address_snapshot: null, place_of_supply_state_code: null, subtotal_amount: '210.00', discount_amount: '21.00', taxable_amount: '180.00', cgst_amount: '4.50', sgst_amount: '4.50', igst_amount: '0.00', round_off_amount: '0.00', total_amount: '189.00', paid_amount: '0.00', balance_due: '189.00', payment_status: 'unpaid', cancelled: false, created_at: '2026-10-26T12:00:00' }
const detail = { bill, items: [{ uuid: 'i1', product_uuid: 'p1', product_name: 'Rice', quantity: '2', selling_price: '105.00', subtotal: '210.00', taxable_value: '90.00', gst: '4.50', line_taxable_value: '180.00', line_gst: '9.00', amount: '189.00', gst_percent: '5', unit: 'kg' }], payments: [], credit_notes: [], history: [] }
const product = { uuid: 'p1', name: 'Rice', selling_price: '105.00', quantity: '10', barcode: '8901' }
const preview = { subtotal: '210.00', discount_amount: '21.00', taxable_amount: '180.00', cgst_amount: '4.50', sgst_amount: '4.50', igst_amount: '0.00', round_off_amount: '0.00', total: '189.00' }
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
}
const returnLine = { item_uuid: 'i1', product_name: 'Rice', unit: 'kg', sold: '2', already_returned: '0', remaining: '2', returning: '0.5', credit: '94.50', goes_back_to_stock: true }
const returnReview = { lines: [returnLine], subtotal: '90.00', taxable_amount: '90.00', cgst_amount: '2.25', sgst_amount: '2.25', igst_amount: '0.00', round_off_amount: '0.00', tax_amount: '4.50', credit_total: '94.50', settlement: 'refund', invoice_paid: '0.00', invoice_due: '189.00', invoice_due_after: '189.00', refund_to_customer: '94.50', reduces_invoice_due: '0.00', can_return: true }
afterEach(() => vi.unstubAllGlobals())

test('staff can browse bills and filters are sent to the API', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ok('GET', /^\/v1\/shops\/s1\/bills\?/, { items: [bill], total: 1, next_cursor: null })])
  renderApp('/billing')
  expect(await screen.findByRole('link', { name: bill.bill_number })).toBeInTheDocument()
  await userEvent.selectOptions(screen.getByLabelText('Payment status'), 'unpaid')
  await userEvent.type(screen.getByLabelText('Search bills'), 'Ravi & Co')
  await waitFor(() => expect(calls.some(c => c.path.includes('q=Ravi+%26+Co') && c.path.includes('status=unpaid'))).toBe(true))
})

test('staff can record payments but cannot cancel or return items', async () => {
  fakeApi([...SIGNED_IN, SHOP('staff'), ok('GET', '/v1/shops/s1/bills/b1', detail)])
  renderApp('/billing/b1')
  expect(await screen.findByRole('button', { name: 'Record payment' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Return items' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Cancel bill' })).not.toBeInTheDocument()
  const row = screen.getByRole('row', { name: /Rice/ })
  expect(within(row).getByText('₹189.00')).toBeInTheDocument()
  expect(within(row).getByText('₹9.00')).toBeInTheDocument()
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
  await userEvent.click(within(dialog).getByRole('button', { name: 'Return items' }))
  await waitFor(() => expect(calls.find(c => c.path.endsWith('/credit-note'))?.body).toMatchObject({ quantities: { i1: '0.5' }, settlement: 'adjust' }))
})

test('a cancelled bill has no payment, cancellation or return actions', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/bills/b1', { ...detail, bill: { ...bill, cancelled: true, cancel_reason: 'Mistake' } })])
  renderApp('/billing/b1')
  await screen.findByText('Cancelled: Mistake')
  for (const name of ['Record payment', 'Return items', 'Cancel bill']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
})

test('a bill waits for server pricing and confirmation, then sends decimal input', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', detail), ok('GET', '/v1/shops/s1/bills/b1', detail)])
  renderApp('/billing/new')
  expect(await screen.findByRole('button', { name: /^Create invoice/ })).toBeDisabled()
  await addRice()
  await userEvent.click(screen.getByLabelText('Not paid yet'))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  await screen.findByText(bill.bill_number)
  expect(calls.find(c => c.path === '/v1/shops/s1/bills')?.body).toMatchObject({ items: [{ product_uuid: 'p1', quantity: '1' }], discount_percent: '0', payment: { amount: '0', method: 'cash' } })
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
  expect(calls.find(c => c.path === '/v1/shops/s1/bills')?.body).toMatchObject({ payment: { amount: preview.total, method: 'cash' } })
})

test('a failed save keeps an identical body for retry and locks the cart', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', { error: { code: 'network', message: 'Connection interrupted' } }, 503)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText('Not paid yet'))
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
  expect(await screen.findByText('No bills found')).toBeInTheDocument()
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

test('unpaid money for a customer with no phone number is called out before saving', async () => {
  fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText('Not paid yet'))
  expect(await screen.findByText(/walk-in sale, so the unpaid amount will not be tracked/)).toBeInTheDocument()
})

test('a saved invoice shows what was recorded and the three next steps', async () => {
  const part = { ...detail, bill: { ...bill, total_amount: '189.00', paid_amount: '100.00', balance_due: '89.00' } }
  fakeApi([...SIGNED_IN, SHOP('staff'), ...CHECKOUT, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', part)])
  renderApp('/billing/new')
  await addRice()
  await userEvent.click(screen.getByLabelText('Part paid'))
  await userEvent.type(screen.getByLabelText(/^Paid now/), '100')
  await waitFor(() => expect(screen.getByRole('button', { name: /^Create invoice/ })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: /^Create invoice/ }))
  expect(await screen.findByRole('heading', { name: 'Invoice saved' })).toBeInTheDocument()
  expect(screen.getByText('₹89.00')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Print' })).toHaveAttribute('href', '/billing/b1?print=1')
  expect(screen.getByRole('link', { name: 'View invoice' })).toHaveAttribute('href', '/billing/b1')
  await userEvent.click(screen.getByRole('button', { name: 'New invoice' }))
  expect(await screen.findByLabelText('Scan barcode or search products')).toHaveFocus()
  expect(screen.queryByLabelText('Quantity for Rice')).not.toBeInTheDocument()
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
