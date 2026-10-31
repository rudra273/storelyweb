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
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/bills/b1', detail), ok('POST', '/v1/shops/s1/bills/b1/credit-note', detail)])
  renderApp('/billing/b1')
  await userEvent.click(await screen.findByRole('button', { name: 'Return items' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByRole('button', { name: 'Return items' })).toBeDisabled()
  await userEvent.type(within(dialog).getByLabelText('Return Rice'), '0.5')
  await userEvent.selectOptions(within(dialog).getByLabelText('Settlement'), 'adjust')
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
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), products, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', detail), ok('GET', '/v1/shops/s1/bills/b1', detail)])
  renderApp('/billing/new')
  expect(await screen.findByRole('button', { name: 'Create bill' })).toBeDisabled()
  await userEvent.click(await screen.findByRole('button', { name: /Rice · 8901/ }))
  await screen.findByRole('heading', { name: 'Bill summary' })
  await userEvent.click(screen.getByLabelText('Not paid yet'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create bill' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Create bill' }))
  await screen.findByRole('heading', { name: bill.bill_number })
  expect(calls.find(c => c.path === '/v1/shops/s1/bills')?.body).toMatchObject({ items: [{ product_uuid: 'p1', quantity: '1' }], discount_percent: '0', payment: { amount: '0', method: 'cash' } })
})

test('a bill cannot be created until the cashier says how the customer paid', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), products, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', detail), ok('GET', '/v1/shops/s1/bills/b1', detail)])
  renderApp('/billing/new')
  await userEvent.click(await screen.findByRole('button', { name: /Rice · 8901/ }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create bill' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Create bill' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Choose how the customer paid')
  expect(calls.some(c => c.path === '/v1/shops/s1/bills')).toBe(false)
  await userEvent.click(screen.getByLabelText(/^Paid in full/))
  await userEvent.click(screen.getByRole('button', { name: 'Create bill' }))
  await screen.findByRole('heading', { name: bill.bill_number })
  expect(calls.find(c => c.path === '/v1/shops/s1/bills')?.body).toMatchObject({ payment: { amount: preview.total, method: 'cash' } })
})

test('a failed save keeps an identical body for retry and locks the cart', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), products, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', { error: { code: 'network', message: 'Connection interrupted' } }, 503)])
  renderApp('/billing/new')
  await userEvent.click(await screen.findByRole('button', { name: /Rice · 8901/ }))
  await userEvent.click(screen.getByLabelText('Not paid yet'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create bill' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Create bill' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('cart is locked')
  expect(screen.getByLabelText('Quantity for Rice')).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Retry saving bill' }))
  const writes = calls.filter(c => c.path === '/v1/shops/s1/bills')
  expect(writes).toHaveLength(2)
  expect(writes[0]!.body).toEqual(writes[1]!.body)
  expect(writes[0]!.headers.get('Idempotency-Key')).toBeTruthy()
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
  fakeApi([...SIGNED_IN, SHOP('staff'), products, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', { error: { code: 'overpayment', message: 'Only 189 is due' } }, 409)])
  renderApp('/billing/new')
  await userEvent.click(await screen.findByRole('button', { name: /Rice · 8901/ }))
  await userEvent.click(screen.getByLabelText('Not paid yet'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create bill' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Create bill' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Only 189 is due')
  expect(screen.getByLabelText('Not paid yet')).toBeEnabled()
})

for (const action of ['payment', 'return'] as const) {
  test(`an uncertain ${action} retries the frozen request with the same key`, async () => {
    const endpoint = action === 'payment' ? 'payments' : 'credit-note'
    const label = action === 'payment' ? 'Record payment' : 'Return items'
    const calls = fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/bills/b1', detail), ok('POST', `/v1/shops/s1/bills/b1/${endpoint}`, { error: { message: 'Connection interrupted' } }, 503)])
    renderApp('/billing/b1')
    await userEvent.click(await screen.findByRole('button', { name: label }))
    const dialog = screen.getByRole('dialog')
    if (action === 'return') await userEvent.type(within(dialog).getByLabelText('Return Rice'), '0.5')
    await userEvent.click(within(dialog).getByRole('button', { name: label }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Details are locked')
    expect(within(dialog).getByLabelText(action === 'payment' ? 'Amount (₹)' : 'Return Rice')).toBeDisabled()
    expect(within(dialog).getAllByRole('button', { name: 'Close' }).every(b => b.hasAttribute('disabled'))).toBe(true)
    await userEvent.click(within(dialog).getByRole('button', { name: `Retry ${action}` }))
    const writes = calls.filter(c => c.path.endsWith(`/${endpoint}`))
    expect(writes).toHaveLength(2)
    expect(writes[0]!.body).toEqual(writes[1]!.body)
    expect(writes[0]!.headers.get('Idempotency-Key')).toBeTruthy()
    expect(writes[0]!.headers.get('Idempotency-Key')).toBe(writes[1]!.headers.get('Idempotency-Key'))
  })
}

test('an idempotency conflict keeps the original bill request locked for safe retry', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff'), products, ok('POST', '/v1/shops/s1/bills/preview', preview), ok('POST', '/v1/shops/s1/bills', { error: { code: 'idempotency_conflict', message: 'Request conflict' } }, 409)])
  renderApp('/billing/new')
  await userEvent.click(await screen.findByRole('button', { name: /Rice · 8901/ }))
  await userEvent.click(screen.getByLabelText('Not paid yet'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Create bill' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Create bill' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('cart is locked')
  expect(screen.getByLabelText('Quantity for Rice')).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Retry saving bill' }))
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

test('business bills expand the required tax details', async () => {
  fakeApi([...SIGNED_IN, SHOP('staff'), products])
  renderApp('/billing/new')
  await screen.findByRole('heading', { name: 'New bill' })
  await userEvent.selectOptions(screen.getByLabelText('Bill type'), 'b2b')
  expect(screen.getByLabelText('GSTIN')).toBeRequired()
  expect(screen.getByLabelText('GSTIN').closest('details')).toHaveAttribute('open')
})
