import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { fakeApi, ok, renderApp, SIGNED_IN } from '../test-utils'
import { draftKey } from './draft'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })
const PRODUCT = { uuid: 'p1', name: 'Rice', product_code: 'R1', barcode: null, unit_uuid: null, unit_name: 'kg', category_uuid: null, category_name: null, hsn_code: null, gst_percent: null, selling_price: '30', purchase_price: '18', quantity: '10', track_stock: true, low_stock: false, next_expiry: null, reorder_level: null, mrp_price: null, updated_at: '2026-10-01' }
const RECEIPT = { uuid: 'receipt1', supplier_uuid: null, supplier_name: null, purchase_date: '2026-10-01', invoice_number: null, notes: null, subtotal: '36.00', payment_status: 'not_recorded', created_at: '2026-10-29T00:00:00Z', items: [{ uuid: 'l1', product_uuid: 'p1', product_name: 'Rice', unit_name: 'kg', quantity: '2', unit_cost: '18', amount: '36.00', batch_no: null, expiry_date: null, line_number: 1, movement_uuid: 'm1' }] }
const BASE = '/v1/shops/s1'
function setup({ role = 'owner', fail = false } = {}) {
  return fakeApi([
    ...SIGNED_IN, ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Shop', role }]),
    ok('GET', /\/products\?/, { items: [PRODUCT], total: 1, next_cursor: null }),
    ok('GET', `${BASE}/products/p1`, { product: PRODUCT, movements: [] }),
    ok('GET', `${BASE}/categories`, []), ok('GET', `${BASE}/units`, []),
    ok('GET', `${BASE}/suppliers`, []),
    ok('POST', `${BASE}/suppliers`, { uuid: 'supply1', name: 'Wholesale', phone: null, email: null, gstin: null, address: null, notes: null }, 201),
    ok('POST', `${BASE}/purchase-receipts`, fail ? { error: { code: 'internal_error', message: 'Response interrupted.' } } : RECEIPT, fail ? 500 : 201),
    ok('GET', /^\/v1\/shops\/s1\/purchase-receipts\?/, [RECEIPT]),
  ])
}
async function openPurchase() {
  await userEvent.click(await screen.findByRole('button', { name: 'Add purchase' }))
  return screen.getByRole('dialog', { name: 'Add purchase' })
}
async function addRice() {
  await userEvent.click(await screen.findByRole('button', { name: 'Add Rice' }))
}

test('purchase posts decimal lines and clears its draft only after success', async () => {
  const calls = setup()
  renderApp('/products')
  await openPurchase(); await addRice()
  fireEvent.change(screen.getByLabelText('Quantity · item 1'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('Receipt date'), { target: { value: '2026-10-01' } })
  await userEvent.click(screen.getByRole('button', { name: 'Save purchase' }))
  expect(await screen.findByRole('dialog', { name: 'Purchase saved' })).toBeInTheDocument()
  const body = calls.find(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))?.body
  expect(body).toMatchObject({ purchase_date: '2026-10-01', supplier_uuid: null, items: [{ product_uuid: 'p1', quantity: '2', unit_cost: '18' }] })
  expect(localStorage.getItem(draftKey('u1', 's1'))).toBeNull()
})

test('close and reopen restores dates, lots and distinct rows of the same product', async () => {
  setup(); renderApp('/products')
  await openPurchase(); await addRice(); await addRice()
  fireEvent.change(screen.getByLabelText('Batch · item 1'), { target: { value: 'LOT-A' } })
  fireEvent.change(screen.getByLabelText('Unit cost (₹) · item 2'), { target: { value: '20' } })
  await userEvent.click(screen.getByRole('button', { name: 'Close and keep draft' }))
  await openPurchase()
  expect(screen.getByLabelText('Batch · item 1')).toHaveValue('LOT-A')
  expect(screen.getByLabelText('Unit cost (₹) · item 2')).toHaveValue('20')
})

test('uncertain save freezes payload and retries with the same key after reopen', async () => {
  const calls = setup({ fail: true }); renderApp('/products')
  await openPurchase(); await addRice()
  await userEvent.click(screen.getByRole('button', { name: 'Save purchase' }))
  expect(await screen.findByText('Response interrupted.')).toBeInTheDocument()
  expect(screen.getByLabelText('Quantity · item 1')).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Close and keep draft' }))
  await openPurchase()
  await userEvent.click(screen.getByRole('button', { name: 'Retry purchase' }))
  await waitFor(() => expect(calls.filter(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))).toHaveLength(2))
  const requests = calls.filter(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))
  expect(requests[0]?.body).toEqual(requests[1]?.body)
})

test('inline supplier creation preserves purchase items and selects the new supplier', async () => {
  setup(); renderApp('/products'); await openPurchase(); await addRice()
  await userEvent.click(screen.getByRole('button', { name: 'Add supplier' }))
  await userEvent.type(screen.getByLabelText('Supplier name'), 'Wholesale')
  await userEvent.click(screen.getByRole('button', { name: 'Save supplier' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add supplier' })).not.toBeInTheDocument())
  expect(screen.getByLabelText('Supplier (optional)')).toHaveValue('supply1')
  expect(screen.getByLabelText('Quantity · item 1')).toHaveValue('1')
})

test('invalid quantities do not send purchase requests', async () => {
  const calls = setup(); renderApp('/products'); await openPurchase(); await addRice()
  fireEvent.change(screen.getByLabelText('Quantity · item 1'), { target: { value: '0' } })
  await userEvent.click(screen.getByRole('button', { name: 'Save purchase' }))
  expect(await screen.findByText(/enter a positive quantity/)).toBeInTheDocument()
  expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))).toBe(false)
})

test('another tab changing the draft blocks overwriting and posting', async () => {
  const calls = setup(); renderApp('/products'); await openPurchase(); await addRice()
  const key = draftKey('u1', 's1')
  localStorage.setItem(key, 'changed-in-another-tab')
  fireEvent(window, new StorageEvent('storage', { key }))
  expect(screen.getByText(/draft changed in another tab/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save purchase' })).toBeDisabled()
  expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))).toBe(false)
})

test('purchase history opens saved document snapshots', async () => {
  setup(); renderApp('/products')
  await userEvent.click(await screen.findByText('More actions'))
  await userEvent.click(screen.getByRole('button', { name: 'Purchase history' }))
  await userEvent.click(await screen.findByRole('button', { name: 'View purchase 2026-10-01' }))
  expect(within(screen.getByRole('dialog', { name: 'Purchase receipt' })).getByText('Rice')).toBeInTheDocument()
})

test('restock preselects the product and staff have no purchase entry', async () => {
  setup(); const view = renderApp('/products/p1')
  await userEvent.click(await screen.findByRole('button', { name: 'Restock' }))
  expect(screen.getByLabelText('Unit cost (₹) · item 1')).toHaveValue('18')
  view.unmount(); localStorage.clear()
  const calls = setup({ role: 'staff' }); renderApp('/products')
  await screen.findByRole('button', { name: 'Rice' })
  expect(screen.queryByRole('button', { name: 'Add purchase' })).not.toBeInTheDocument()
  expect(calls.some(c => c.path.includes('/purchase-receipts'))).toBe(false)
})

test('storage failure blocks posting until the draft can be saved', async () => {
  const calls = setup(); renderApp('/products'); await openPurchase()
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage blocked') })
  await addRice()
  expect(screen.getByRole('button', { name: 'Save purchase' })).toBeDisabled()
  expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))).toBe(false)
  storage.mockRestore()
  await userEvent.click(screen.getByRole('button', { name: 'Retry saving draft' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save purchase' }))
  expect(await screen.findByRole('dialog', { name: 'Purchase saved' })).toBeInTheDocument()
})

test('offline confirmation keeps the editable draft without sending a request', async () => {
  const calls = setup(); renderApp('/products'); await openPurchase(); await addRice()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  await userEvent.click(screen.getByRole('button', { name: 'Save purchase' }))
  expect(await screen.findByText(/You are offline/)).toBeInTheDocument()
  expect(screen.getByLabelText('Quantity · item 1')).not.toBeDisabled()
  expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))).toBe(false)
})

test('rapid duplicate form submissions send only one purchase request', async () => {
  const calls = setup(); renderApp('/products'); const dialog = await openPurchase(); await addRice()
  const form = dialog.querySelector('form')!
  fireEvent.submit(form); fireEvent.submit(form)
  await screen.findByRole('dialog', { name: 'Purchase saved' })
  expect(calls.filter(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))).toHaveLength(1)
})

test('access loss after an uncertain save cannot unlock or discard that request', async () => {
  setup({ fail: true }); renderApp('/products'); await openPurchase(); await addRice()
  await userEvent.click(screen.getByRole('button', { name: 'Save purchase' }))
  await screen.findByText('Response interrupted.')
  const previousFetch = globalThis.fetch
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/purchase-receipts') && init?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ error: { code: 'forbidden', message: 'Access changed.' } }), { status: 403 }))
    return previousFetch(input, init)
  })
  await userEvent.click(screen.getByRole('button', { name: 'Retry purchase' }))
  await screen.findByText('Access changed.')
  expect(screen.getByLabelText('Quantity · item 1')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Discard draft' })).toBeDisabled()
})
