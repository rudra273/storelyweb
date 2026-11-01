import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { fakeApi, ok, renderApp, SIGNED_IN } from '../test-utils'
import { draftKey } from './composer/draft'

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

test('new products stay staged, recover after closing, and are created only by the receipt request', async () => {
  const calls = setup(); renderApp('/products'); await openPurchase()
  await userEvent.click(screen.getByRole('button', { name: 'New product' }))
  await userEvent.type(screen.getByLabelText('New product name'), 'New Tea')
  await userEvent.type(screen.getByLabelText('New product unit cost (₹)'), '12.50')
  await userEvent.type(screen.getByLabelText('Selling price (₹, optional)'), '20')
  await userEvent.click(screen.getByRole('button', { name: 'Stage product' }))
  expect(calls.some(c => c.method === 'POST' && (c.path.endsWith('/products') || c.path.endsWith('/purchase-receipts')))).toBe(false)
  await userEvent.click(screen.getByRole('button', { name: 'Close and keep draft' }))
  await openPurchase()
  expect(screen.getByRole('button', { name: 'Edit new product 1' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Save purchase' }))
  await screen.findByRole('dialog', { name: 'Purchase saved' })
  expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))?.body).toMatchObject({ items: [{ product_uuid: null, new_product: { name: 'New Tea', selling_price: '20' }, unit_cost: '12.50' }] })
  expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/products'))).toBe(false)
})

test('editing a new product updates its identity on all staged lots', async () => {
  setup(); renderApp('/products'); await openPurchase()
  await userEvent.click(screen.getByRole('button', { name: 'New product' }))
  await userEvent.type(screen.getByLabelText('New product name'), 'Tea')
  await userEvent.type(screen.getByLabelText('New product unit cost (₹)'), '10')
  await userEvent.click(screen.getByRole('button', { name: 'Stage product' }))
  await userEvent.click(screen.getByRole('button', { name: 'Add another lot of Tea' }))
  await userEvent.click(screen.getByRole('button', { name: 'Edit new product 1' }))
  await userEvent.clear(screen.getByLabelText('New product name'))
  await userEvent.type(screen.getByLabelText('New product name'), 'Assam Tea')
  await userEvent.click(screen.getByRole('button', { name: 'Update staged product' }))
  const stored = JSON.parse(localStorage.getItem(draftKey('u1', 's1'))!)
  expect(stored.items.map((line: { new_product: { name: string } }) => line.new_product.name)).toEqual(['Assam Tea', 'Assam Tea'])
  expect(stored.items[0].new_product.client_key).toBe(stored.items[1].new_product.client_key)
})

function importFixture(duplicate = false) {
  const fingerprint = 'a'.repeat(64)
  return { fingerprint, possible_duplicate: duplicate, warnings: ['Existing product prices are preserved.'], rows: [
    { number: 2, name: 'Rice', item: { product_uuid: null, new_product: { client_key: 'import-product-key', name: 'Rice' }, quantity: '2', unit_cost: '15', batch_no: 'B1', expiry_date: null }, candidates: [{ uuid: 'p1', name: 'Rice', unit_name: 'kg' }], requires_choice: true, error: null },
    { number: 3, name: 'Bad row', item: null, candidates: [], requires_choice: false, error: 'Quantity is required' },
  ] }
}
function mockImportPreview(preview: ReturnType<typeof importFixture>) {
  const previous = globalThis.fetch
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/purchase-receipts/import-preview?')) return Promise.resolve(new Response(JSON.stringify(preview), { status: 200 }))
    return previous(input, init)
  })
}

test('import requires name resolution and explicit exclusion of bad rows before staging', async () => {
  const calls = setup(); mockImportPreview(importFixture()); renderApp('/products'); await openPurchase()
  await userEvent.click(screen.getByRole('button', { name: 'Import purchase file' }))
  await userEvent.upload(screen.getByLabelText('Purchase CSV or Excel file'), new File(['preview fixture'], 'purchase.csv', { type: 'text/csv' }))
  const stage = await screen.findByRole('button', { name: 'Stage 2 purchase items' })
  expect(stage).toBeDisabled()
  await userEvent.selectOptions(screen.getByLabelText('Match row 2'), 'p1')
  await userEvent.click(screen.getByLabelText('Exclude row 3'))
  await userEvent.click(screen.getByRole('button', { name: 'Stage 1 purchase items' }))
  expect(screen.getByLabelText('Quantity · item 1')).toHaveValue('2')
  expect(calls.some(c => c.method === 'POST' && (c.path.endsWith('/products') || c.path.endsWith('/purchase-receipts')))).toBe(false)
  await userEvent.click(screen.getByRole('button', { name: 'Save purchase' }))
  await screen.findByRole('dialog', { name: 'Purchase saved' })
  expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))?.body).toMatchObject({ import_keys: ['a'.repeat(64)], items: [{ product_uuid: 'p1', import_row_number: 2, unit_cost: '15' }] })
})

test('duplicate import acknowledgement is required and is scoped to the reviewed file', async () => {
  setup(); mockImportPreview(importFixture(true)); renderApp('/products'); await openPurchase()
  await userEvent.click(screen.getByRole('button', { name: 'Import purchase file' }))
  await userEvent.upload(screen.getByLabelText('Purchase CSV or Excel file'), new File(['preview fixture'], 'purchase.csv', { type: 'text/csv' }))
  await screen.findByLabelText('Match row 2')
  await userEvent.selectOptions(screen.getByLabelText('Match row 2'), 'p1')
  await userEvent.click(screen.getByLabelText('Exclude row 3'))
  expect(screen.getByRole('button', { name: 'Stage 1 purchase items' })).toBeDisabled()
  await userEvent.click(screen.getByLabelText('I intend to add these quantities again'))
  await userEvent.click(screen.getByRole('button', { name: 'Stage 1 purchase items' }))
  const draft = JSON.parse(localStorage.getItem(draftKey('u1', 's1'))!)
  expect(draft.allow_duplicate_import_keys).toEqual(['a'.repeat(64)])
})

test('purchase saves paid-in-full choice using server total and keeps financial draft fields', async () => {
  const calls = setup()
  renderApp('/products')
  await openPurchase(); await addRice()
  await userEvent.click(screen.getByRole('button', { name: 'Add supplier' }))
  await userEvent.type(screen.getByLabelText('Supplier name'), 'Wholesale')
  await userEvent.click(screen.getByRole('button', { name: 'Save supplier' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add supplier' })).not.toBeInTheDocument())
  await userEvent.click(screen.getByText('Charges, tax and payment terms'))
  fireEvent.change(screen.getByLabelText('GST amount (₹)'), { target: { value: '18' } })
  await userEvent.selectOptions(screen.getByLabelText('Payment', { exact: true }), 'paid')
  await userEvent.selectOptions(screen.getByLabelText('Payment method', { exact: true }), 'upi')
  await userEvent.click(screen.getByRole('button', { name: 'Close and keep draft' }))
  await openPurchase()
  expect(screen.getByLabelText('GST amount (₹)')).toHaveValue('18')
  expect(screen.getByLabelText('Payment', { exact: true })).toHaveValue('paid')
  await userEvent.click(screen.getByRole('button', { name: 'Save purchase' }))
  await screen.findByRole('dialog', { name: 'Purchase saved' })
  expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))?.body).toMatchObject({ supplier_uuid: 'supply1', paid_in_full: true, tax_amount: '18', payment_method: 'upi' })
})
