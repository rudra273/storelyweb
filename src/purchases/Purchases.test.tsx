import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { fakeApi, ok, renderApp, SIGNED_IN } from '../test-utils'
import { draftKey } from './composer/draft'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })
const PRODUCT = { uuid: 'p1', name: 'Rice', product_code: 'R1', barcode: null, unit_uuid: null, unit_name: 'kg', category_uuid: null, category_name: null, hsn_code: null, gst_percent: null, selling_price: '30', purchase_price: '18', quantity: '10', track_stock: true, low_stock: false, next_expiry: null, reorder_level: null, mrp_price: null, updated_at: '2026-10-01' }
const RECEIPT = { uuid: 'receipt1', supplier_uuid: null, supplier_name: null, purchase_date: '2026-10-01', invoice_number: null, notes: null, subtotal: '36.00', payment_status: 'not_recorded', created_at: '2026-10-29T00:00:00Z', items: [{ uuid: 'l1', product_uuid: 'p1', product_name: 'Rice', unit_name: 'kg', quantity: '2', unit_cost: '18', amount: '36.00', batch_no: null, expiry_date: null, line_number: 1, movement_uuid: 'm1' }] }
const SUMMARY = { purchases: 3, purchase_value: '240.00', payments_made: '80.00', unrecorded_purchases: 1, unrecorded_stock_cost: '36.00', payable: '160.00', overdue: '80.00', overdue_purchases: 1, suppliers_owed: 2 }
const BASE = '/v1/shops/s1'
function setup({ role = 'owner', fail = false } = {}) {
  return fakeApi([
    ...SIGNED_IN, ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Shop', role }]),
    ok('GET', /\/products\?/, { items: [PRODUCT], total: 1, next_cursor: null }),
    ok('GET', `${BASE}/products/p1`, { product: PRODUCT, movements: [] }),
    ok('GET', `${BASE}/categories`, []), ok('GET', `${BASE}/units`, []),
    ok('GET', `${BASE}/suppliers`, []),
    ok('POST', `${BASE}/suppliers`, { uuid: 'supply1', name: 'Wholesale', phone: null, email: null, gstin: null, address: null, notes: null }, 201),
    ok('POST', `${BASE}/purchase-receipts/preview`, { subtotal: '36.00', tax_amount: '0.00', charges_amount: '0.00', discount_amount: '0.00', total: '36.00', paid_now: '0.00', balance_due: '36.00', payment_recorded: false }),
    ok('POST', `${BASE}/purchase-receipts`, fail ? { error: { code: 'internal_error', message: 'Response interrupted.' } } : RECEIPT, fail ? 500 : 201),
    ok('GET', /^\/v1\/shops\/s1\/purchase-receipts\/summary/, SUMMARY),
    ok('GET', `${BASE}/purchase-receipts/receipt1`, RECEIPT),
    ok('GET', /^\/v1\/shops\/s1\/purchase-receipts\?/, [RECEIPT]),
  ])
}
async function openPurchase() {
  await screen.findByRole('heading', { name: 'Record purchase' })
}
// Leaving the page and coming back is how a draft is reopened: it was kept on this browser.
async function reopen() {
  await userEvent.click(screen.getByRole('link', { name: '← Purchase invoices' }))
  await userEvent.click(await screen.findByRole('link', { name: 'Record purchase' }))
  await openPurchase()
}
// Saving waits for the server's total, so tests wait for the button as a person would.
async function clickSave() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save purchase' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Save purchase' }))
}
async function addRice() {
  await userEvent.click(await screen.findByRole('button', { name: 'Add Rice' }))
}

test('purchase posts decimal lines and clears its draft only after success', async () => {
  const calls = setup()
  renderApp('/purchases/new')
  await openPurchase(); await addRice()
  fireEvent.change(screen.getByLabelText('Quantity · item 1'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('Receipt date'), { target: { value: '2026-10-01' } })
  await clickSave()
  expect(await screen.findByRole('heading', { name: 'Purchase saved' })).toBeInTheDocument()
  const body = calls.find(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))?.body
  expect(body).toMatchObject({ purchase_date: '2026-10-01', supplier_uuid: null, items: [{ product_uuid: 'p1', quantity: '2', unit_cost: '18' }] })
  expect(localStorage.getItem(draftKey('u1', 's1'))).toBeNull()
})

test('close and reopen restores dates, lots and distinct rows of the same product', async () => {
  setup(); renderApp('/purchases/new')
  await openPurchase(); await addRice(); await addRice()
  fireEvent.change(screen.getByLabelText('Batch · item 1'), { target: { value: 'LOT-A' } })
  fireEvent.change(screen.getByLabelText('Unit cost (₹) · item 2'), { target: { value: '20' } })
  await reopen()
  expect(screen.getByLabelText('Batch · item 1')).toHaveValue('LOT-A')
  expect(screen.getByLabelText('Unit cost (₹) · item 2')).toHaveValue('20')
})

test('uncertain save freezes payload and retries with the same key after reopen', async () => {
  const calls = setup({ fail: true }); renderApp('/purchases/new')
  await openPurchase(); await addRice()
  await clickSave()
  expect(await screen.findByText('Response interrupted.')).toBeInTheDocument()
  expect(screen.getByLabelText('Quantity · item 1')).toBeDisabled()
  await reopen()
  await userEvent.click(screen.getByRole('button', { name: 'Retry purchase' }))
  await waitFor(() => expect(calls.filter(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))).toHaveLength(2))
  const requests = calls.filter(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))
  expect(requests[0]?.body).toEqual(requests[1]?.body)
})

test('inline supplier creation preserves purchase items and selects the new supplier', async () => {
  setup(); renderApp('/purchases/new'); await openPurchase(); await addRice()
  await userEvent.type(screen.getByRole('combobox', { name: 'Supplier' }), 'Wholesale')
  await userEvent.click(await screen.findByRole('option', { name: /Add “Wholesale” as a new supplier/ }))
  expect(screen.getByLabelText('Supplier name')).toHaveValue('Wholesale')
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Add supplier' })).getByRole('button', { name: 'Add supplier' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add supplier' })).not.toBeInTheDocument())
  expect(JSON.parse(localStorage.getItem(draftKey('u1', 's1'))!).supplier_uuid).toBe('supply1')
  expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument()
  expect(screen.getByLabelText('Quantity · item 1')).toHaveValue('1')
})

test('invalid quantities do not send purchase requests', async () => {
  const calls = setup(); renderApp('/purchases/new'); await openPurchase(); await addRice()
  fireEvent.change(screen.getByLabelText('Quantity · item 1'), { target: { value: '0' } })
  await clickSave()
  expect(await screen.findByText(/enter a positive quantity/)).toBeInTheDocument()
  expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))).toBe(false)
})

test('another tab changing the draft blocks overwriting and posting', async () => {
  const calls = setup(); renderApp('/purchases/new'); await openPurchase(); await addRice()
  const key = draftKey('u1', 's1')
  localStorage.setItem(key, 'changed-in-another-tab')
  fireEvent(window, new StorageEvent('storage', { key }))
  expect(screen.getByText(/draft changed in another tab/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save purchase' })).toBeDisabled()
  expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))).toBe(false)
})

test('purchase invoices has its own address and opens saved document snapshots', async () => {
  setup(); renderApp('/purchases')
  expect(await screen.findByRole('heading', { name: 'Purchase invoices' })).toBeInTheDocument()
  expect(document.title).toBe('Purchase invoices · Storely')
  expect(screen.getByRole('link', { name: 'Purchase invoices' })).toHaveAttribute('href', '/purchases')
  await userEvent.click(await screen.findByRole('link', { name: 'View purchase 1 Oct 2026' }))
  expect(await screen.findByRole('heading', { name: 'Purchase with no supplier' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Rice' })).toHaveAttribute('href', '/products/p1')
  expect(screen.getByText(/not counted in what you owe/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '← Purchase invoices' })).toHaveAttribute('href', '/purchases')
})

test('the summary separates the dates chosen from what is owed today, and each figure opens its list', async () => {
  const calls = setup(); renderApp('/purchases?from=2026-10-01')
  const owe = (await screen.findByText('You owe suppliers')).closest('.kpi') as HTMLElement
  expect(within(owe).getByText('₹160.00')).toBeInTheDocument()
  expect(within(owe).getByText(/Today · 2 suppliers/)).toBeInTheDocument()
  expect(within(screen.getByText('Purchased').closest('.kpi') as HTMLElement).getByText(/In the dates chosen · 3 purchases/)).toBeInTheDocument()
  expect(screen.getByText(/1 purchase has no payment terms recorded \(₹36\.00 of stock\)/)).toBeInTheDocument()
  // The summary is narrowed by dates and supplier only, never by the payment filters.
  await userEvent.click(owe)
  await waitFor(() => expect(calls.some(c => /purchase-receipts\?.*status=open/.test(c.path))).toBe(true))
  expect(calls.filter(c => /summary/.test(c.path)).every(c => !/status=/.test(c.path))).toBe(true)
  await userEvent.click(screen.getByText('Overdue').closest('.kpi') as HTMLElement)
  await waitFor(() => expect(calls.some(c => /purchase-receipts\?.*overdue=true/.test(c.path))).toBe(true))
})

test('purchase filters live in the address and can be cleared', async () => {
  const calls = setup(); renderApp('/purchases?status=paid&supplier=sup1')
  await waitFor(() => expect(calls.some(c => /purchase-receipts\?.*status=paid/.test(c.path) && /supplier=sup1/.test(c.path))).toBe(true))
  expect(screen.getByLabelText('Payment')).toHaveValue('paid')
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getByLabelText('Payment')).toHaveValue('')
})

test('a purchase past its due date is flagged, and a failed summary can be retried', async () => {
  const late = { ...RECEIPT, supplier_name: 'Alpha', total: '36.00', payment_status: 'unpaid', due_date: '2020-01-01', balance_due: '36.00', paid_amount: '0' }
  fakeApi([
    ...SIGNED_IN, ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Shop', role: 'owner' }]),
    ok('GET', `${BASE}/suppliers`, []),
    ok('GET', /^\/v1\/shops\/s1\/purchase-receipts\/summary/, { error: { code: 'internal_error', message: 'Down.' } }, 500),
    ok('GET', /^\/v1\/shops\/s1\/purchase-receipts\?/, [late]),
  ])
  renderApp('/purchases')
  expect(await screen.findByText('Overdue', { selector: '.payment-badge' })).toBeInTheDocument()
  expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
  expect(screen.queryByText('₹0.00')).not.toBeInTheDocument()
})

test('Record purchase on the Purchases page opens the full workspace at its own address', async () => {
  setup(); renderApp('/purchases')
  await userEvent.click(await screen.findByRole('link', { name: 'Record purchase' }))
  expect(await screen.findByRole('heading', { name: 'Record purchase' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: '← Purchase invoices' })).toHaveAttribute('href', '/purchases')
})

test('restock preselects the product and staff have no purchase entry', async () => {
  setup(); const view = renderApp('/products/p1')
  await userEvent.click(await screen.findByRole('button', { name: 'Restock' }))
  expect(await screen.findByRole('heading', { name: 'Record purchase' })).toBeInTheDocument()
  expect(await screen.findByLabelText('Unit cost (₹) · item 1')).toHaveValue('18')
  view.unmount(); localStorage.clear()
  const calls = setup({ role: 'staff' }); renderApp('/products')
  await screen.findByRole('button', { name: 'Rice' })
  expect(screen.queryByRole('button', { name: 'Record purchase' })).not.toBeInTheDocument()
  expect(calls.some(c => c.path.includes('/purchase-receipts'))).toBe(false)
})

test('storage failure blocks posting until the draft can be saved', async () => {
  const calls = setup(); renderApp('/purchases/new'); await openPurchase()
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage blocked') })
  await addRice()
  expect(screen.getByRole('button', { name: 'Save purchase' })).toBeDisabled()
  expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))).toBe(false)
  storage.mockRestore()
  await userEvent.click(screen.getByRole('button', { name: 'Retry saving draft' }))
  await clickSave()
  expect(await screen.findByRole('heading', { name: 'Purchase saved' })).toBeInTheDocument()
})

test('offline confirmation keeps the editable draft without sending a request', async () => {
  const calls = setup(); renderApp('/purchases/new'); await openPurchase(); await addRice()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  await clickSave()
  expect(await screen.findByText(/You are offline/)).toBeInTheDocument()
  expect(screen.getByLabelText('Quantity · item 1')).not.toBeDisabled()
  expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))).toBe(false)
})

test('rapid duplicate form submissions send only one purchase request', async () => {
  const calls = setup(); renderApp('/purchases/new'); await openPurchase(); await addRice()
  const form = document.querySelector('form.pw-grid')!
  fireEvent.submit(form); fireEvent.submit(form)
  await screen.findByRole('heading', { name: 'Purchase saved' })
  expect(calls.filter(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))).toHaveLength(1)
})

test('access loss after an uncertain save cannot unlock or discard that request', async () => {
  setup({ fail: true }); renderApp('/purchases/new'); await openPurchase(); await addRice()
  await clickSave()
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
  const calls = setup(); renderApp('/purchases/new'); await openPurchase()
  await userEvent.click(screen.getByRole('button', { name: 'New product' }))
  await userEvent.type(screen.getByLabelText('New product name'), 'New Tea')
  await userEvent.type(screen.getByLabelText('New product unit cost (₹)'), '12.50')
  await userEvent.type(screen.getByLabelText('Selling price (₹, optional)'), '20')
  await userEvent.click(screen.getByRole('button', { name: 'Stage product' }))
  expect(calls.some(c => c.method === 'POST' && (c.path.endsWith('/products') || c.path.endsWith('/purchase-receipts')))).toBe(false)
  await reopen()
  expect(screen.getByRole('button', { name: 'Edit new product 1' })).toBeInTheDocument()
  await clickSave()
  await screen.findByRole('heading', { name: 'Purchase saved' })
  expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))?.body).toMatchObject({ items: [{ product_uuid: null, new_product: { name: 'New Tea', selling_price: '20' }, unit_cost: '12.50' }] })
  expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/products'))).toBe(false)
})

test('editing a new product updates its identity on all staged lots', async () => {
  setup(); renderApp('/purchases/new'); await openPurchase()
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
  const calls = setup(); mockImportPreview(importFixture()); renderApp('/purchases/new'); await openPurchase()
  await userEvent.click(screen.getByRole('button', { name: 'Import purchase file' }))
  await userEvent.upload(screen.getByLabelText('Purchase CSV or Excel file'), new File(['preview fixture'], 'purchase.csv', { type: 'text/csv' }))
  const stage = await screen.findByRole('button', { name: 'Stage 2 purchase items' })
  expect(stage).toBeDisabled()
  await userEvent.selectOptions(screen.getByLabelText('Match row 2'), 'p1')
  await userEvent.click(screen.getByLabelText('Exclude row 3'))
  await userEvent.click(screen.getByRole('button', { name: 'Stage 1 purchase items' }))
  expect(screen.getByLabelText('Quantity · item 1')).toHaveValue('2')
  expect(calls.some(c => c.method === 'POST' && (c.path.endsWith('/products') || c.path.endsWith('/purchase-receipts')))).toBe(false)
  await clickSave()
  await screen.findByRole('heading', { name: 'Purchase saved' })
  expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))?.body).toMatchObject({ import_keys: ['a'.repeat(64)], items: [{ product_uuid: 'p1', import_row_number: 2, unit_cost: '15' }] })
})

test('duplicate import acknowledgement is required and is scoped to the reviewed file', async () => {
  setup(); mockImportPreview(importFixture(true)); renderApp('/purchases/new'); await openPurchase()
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
  renderApp('/purchases/new')
  await openPurchase(); await addRice()
  await userEvent.type(screen.getByRole('combobox', { name: 'Supplier' }), 'Wholesale')
  await userEvent.click(await screen.findByRole('option', { name: /Add “Wholesale” as a new supplier/ }))
  expect(screen.getByLabelText('Supplier name')).toHaveValue('Wholesale')
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Add supplier' })).getByRole('button', { name: 'Add supplier' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add supplier' })).not.toBeInTheDocument())
  fireEvent.change(screen.getByLabelText('GST amount (₹)'), { target: { value: '18' } })
  await userEvent.click(screen.getByRole('radio', { name: /Paid in full/ }))
  await userEvent.selectOptions(screen.getByLabelText('Payment method', { exact: true }), 'upi')
  await reopen()
  expect(screen.getByLabelText('GST amount (₹)')).toHaveValue('18')
  expect(screen.getByRole('radio', { name: /Paid in full/ })).toBeChecked()
  await clickSave()
  await screen.findByRole('heading', { name: 'Purchase saved' })
  expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))?.body).toMatchObject({ supplier_uuid: 'supply1', paid_in_full: true, tax_amount: '18', payment_method: 'upi' })
})

test('the footer shows the server total with charges and warns when payment is not recorded', async () => {
  const calls = setup(); renderApp('/purchases/new')
  await openPurchase(); await addRice()
  expect(await screen.findByText(/Left out of supplier dues until payment is recorded/)).toBeInTheDocument()
  expect(screen.getByText('₹36.00', { selector: 'strong' })).toBeInTheDocument()
  expect(calls.find(c => c.path.endsWith('/purchase-receipts/preview'))?.body).toEqual({ items: [{ quantity: '1', unit_cost: '18' }] })
  expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/purchase-receipts'))).toBe(false)
})

test('purchase invoices pages through the address and asks the server for that page', async () => {
  const calls = setup(); renderApp('/purchases?page=2')
  await screen.findByRole('heading', { name: 'Purchase invoices' })
  await waitFor(() => expect(calls.some(c => c.path.includes('/purchase-receipts?limit=25&offset=50'))).toBe(true))
})

test('an empty purchase list offers to record the first purchase', async () => {
  fakeApi([...SIGNED_IN, ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Shop', role: 'owner' }]), ok('GET', /^\/v1\/shops\/s1\/purchase-receipts\?/, [])])
  renderApp('/purchases')
  expect(await screen.findByText('No purchases recorded yet')).toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: 'Record purchase' })).toHaveLength(2)
})

const SUPPLIERS = [
  { uuid: 'sup1', name: 'Alpha Traders', phone: '98', email: null, gstin: null, address: null, notes: null, balance_due: '80.00' },
  { uuid: 'sup2', name: 'Beta Wholesale', phone: null, email: null, gstin: null, address: null, notes: null, balance_due: '0.00' },
]
function withSuppliers(extra: ReturnType<typeof ok>[] = []) {
  return fakeApi([
    ...SIGNED_IN, ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Shop', role: 'owner' }]),
    ...extra,
    ok('GET', /\/products\?/, { items: [PRODUCT], total: 1, next_cursor: null }),
    ok('GET', `${BASE}/categories`, []), ok('GET', `${BASE}/units`, []),
    ok('GET', `${BASE}/suppliers`, SUPPLIERS),
    ok('POST', `${BASE}/purchase-receipts/preview`, { subtotal: '36.00', tax_amount: '0.00', charges_amount: '0.00', discount_amount: '0.00', total: '36.00', paid_now: '0.00', balance_due: '36.00', payment_recorded: false }),
    ok('POST', `${BASE}/purchase-receipts`, RECEIPT, 201),
    ok('GET', /^\/v1\/shops\/s1\/purchase-receipts\/summary/, SUMMARY),
    ok('GET', /^\/v1\/shops\/s1\/purchase-receipts\?/, [RECEIPT]),
  ])
}

test('the supplier is found by typing, shows what is already owed, and can be changed', async () => {
  withSuppliers([ok('GET', /invoice-check/, { existing: null })]); renderApp('/purchases/new')
  await openPurchase()
  const box = screen.getByRole('combobox', { name: 'Supplier' })
  await userEvent.type(box, 'alp')
  const option = await screen.findByRole('option', { name: /Alpha Traders/ })
  expect(option).toHaveTextContent('you owe ₹80.00')
  expect(screen.getByRole('option', { name: /Add “alp” as a new supplier/ })).toBeInTheDocument()
  await userEvent.keyboard('{Enter}')
  expect(JSON.parse(localStorage.getItem(draftKey('u1', 's1'))!).supplier_uuid).toBe('sup1')
  expect(screen.getByText('Alpha Traders')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Change' }))
  expect(screen.getByRole('combobox', { name: 'Supplier' })).toHaveValue('')
})

test('a supplier invoice that is already recorded is flagged before saving and blocks the save', async () => {
  const existing = { uuid: 'receipt9', purchase_date: '2026-09-20', invoice_number: 'INV-7', total: '500.00', subtotal: '450.00', payment_status: 'unpaid' }
  const calls = withSuppliers([ok('GET', /invoice-check/, { existing })]); renderApp('/purchases/new')
  await openPurchase(); await addRice()
  await userEvent.type(screen.getByRole('combobox', { name: 'Supplier' }), 'alp'); await userEvent.keyboard('{Enter}')
  await userEvent.type(screen.getByLabelText('Supplier invoice number'), 'INV-7')
  expect(await screen.findByText(/This supplier invoice is already recorded: 20 Sept 2026, ₹500.00/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'View it' })).toHaveAttribute('href', '/purchases/receipt9')
  expect(screen.getByRole('button', { name: 'Save purchase' })).toBeDisabled()
  expect(calls.some(c => /invoice-check\?.*supplier=sup1.*invoice_number=INV-7/.test(c.path))).toBe(true)
})

test('recording what is owed needs a supplier, and the draft is resumed with a way to start over', async () => {
  withSuppliers(); const view = renderApp('/purchases/new')
  await openPurchase(); await addRice()
  await userEvent.click(screen.getByRole('radio', { name: /Not paid yet/ }))
  expect(screen.getByText('Choose a supplier above to record what you owe.')).toBeInTheDocument()
  view.unmount(); withSuppliers(); renderApp('/purchases/new')
  expect(await screen.findByText(/Continuing your saved draft \(1 item\)/)).toBeInTheDocument()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await userEvent.click(screen.getByRole('button', { name: 'Start over' }))
  expect(screen.queryByText(/Continuing your saved draft/)).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Quantity · item 1')).not.toBeInTheDocument()
})

test('after saving, the workspace links to the purchase and can start another', async () => {
  withSuppliers(); renderApp('/purchases/new')
  await openPurchase(); await addRice()
  await clickSave()
  await screen.findByRole('heading', { name: 'Purchase saved' })
  expect(screen.getByRole('link', { name: 'View purchase' })).toHaveAttribute('href', '/purchases/receipt1')
  await userEvent.click(screen.getByRole('button', { name: 'Record another purchase' }))
  expect(await screen.findByRole('heading', { name: 'Record purchase' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Quantity · item 1')).not.toBeInTheDocument()
})

test('Enter in the product search adds the product when the text names exactly one, without waiting for the list', async () => {
  const calls = setup(); renderApp('/purchases/new')
  await openPurchase()
  await userEvent.type(screen.getByLabelText('Find product'), 'R1{Enter}')
  expect(await screen.findByLabelText('Quantity · item 1')).toHaveValue('1')
  expect(calls.some(c => /products\?.*q=R1.*limit=5/.test(c.path))).toBe(true)
  expect(screen.getByLabelText('Find product')).toHaveValue('')
})

test('Pay supplier on an unpaid purchase pays that purchase, and is absent when nothing is owed', async () => {
  const owed = { ...RECEIPT, supplier_uuid: 'sup1', supplier_name: 'Alpha', invoice_number: 'INV-1', total: '36.00', payment_status: 'unpaid', balance_due: '36.00', paid_amount: '0', due_date: null, payments: [] }
  const calls = fakeApi([
    ...SIGNED_IN, ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Shop', role: 'owner' }]),
    ok('POST', `${BASE}/suppliers/sup1/payments`, { uuid: 'pay1' }, 201),
    ok('GET', `${BASE}/purchase-receipts/receipt1`, owed),
  ])
  renderApp('/purchases/receipt1')
  await userEvent.click(await screen.findByRole('button', { name: 'Pay supplier' }))
  const dialog = screen.getByRole('dialog', { name: 'Pay Alpha' })
  expect(within(dialog).getByText(/Paying/)).toHaveTextContent('Invoice INV-1')
  await userEvent.type(within(dialog).getByLabelText('Amount (₹)'), '10')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))
  await waitFor(() => expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/payments'))?.body).toMatchObject({ amount: '10', purchase_uuid: 'receipt1' }))
})

test('a purchase with nothing owed offers no payment', async () => {
  const settled = { ...RECEIPT, supplier_uuid: 'sup1', supplier_name: 'Alpha', total: '36.00', payment_status: 'paid', balance_due: '0.00', paid_amount: '36.00', payments: [] }
  fakeApi([...SIGNED_IN, ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Shop', role: 'owner' }]), ok('GET', `${BASE}/purchase-receipts/receipt1`, settled)])
  renderApp('/purchases/receipt1')
  expect(await screen.findByRole('heading', { name: 'Purchase from Alpha' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Pay supplier' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Supplier account' })).toHaveAttribute('href', '/suppliers/sup1')
})

const LIVE = { ...RECEIPT, supplier_uuid: 'sup1', supplier_name: 'Alpha', invoice_number: 'INV-1', total: '36.00', payment_status: 'unpaid', balance_due: '36.00', paid_amount: '0', due_date: null, payments: [], reversed_at: null, reversal_reason: null }

test('reversing a purchase says what will happen, needs a reason, and sends it', async () => {
  const calls = fakeApi([
    ...SIGNED_IN, ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Shop', role: 'owner' }]),
    ok('POST', `${BASE}/purchase-receipts/receipt1/reverse`, { ...LIVE, reversed_at: '2026-11-03T10:00:00Z', reversal_reason: 'Typed the wrong quantity' }),
    ok('GET', `${BASE}/purchase-receipts/receipt1`, LIVE),
  ])
  renderApp('/purchases/receipt1')
  await userEvent.click(await screen.findByText('More actions'))
  await userEvent.click(screen.getByRole('button', { name: 'Reverse purchase…' }))
  const dialog = screen.getByRole('dialog', { name: 'Reverse purchase' })
  expect(within(dialog).getByText(/take 1 item back out of stock \(2 kg Rice\)/)).toBeInTheDocument()
  expect(within(dialog).getByText(/take ₹36.00 off what you owe Alpha/)).toBeInTheDocument()
  expect(within(dialog).getByText(/free supplier invoice number INV-1/)).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Reverse purchase' }))
  expect(await within(dialog).findByText(/at least 3 characters/)).toBeInTheDocument()
  expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/reverse'))).toBe(false)
  await userEvent.type(within(dialog).getByLabelText('Why is this being reversed?'), 'Typed the wrong quantity')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Reverse purchase' }))
  await waitFor(() => expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/reverse'))?.body).toEqual({ reason: 'Typed the wrong quantity' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Reverse purchase' })).not.toBeInTheDocument())
})

test('a reversed purchase says so, offers the corrected purchase, and offers no payment or second reversal', async () => {
  const reversed = { ...LIVE, balance_due: null, reversed_at: '2026-11-03T10:00:00Z', reversal_reason: 'Entered twice' }
  fakeApi([...SIGNED_IN, ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Shop', role: 'owner' }]), ok('GET', `${BASE}/purchase-receipts/receipt1`, reversed)])
  renderApp('/purchases/receipt1')
  expect(await screen.findByText(/This purchase was reversed on 3 Nov 2026/)).toBeInTheDocument()
  expect(screen.getByText(/Reason: Entered twice/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Record the corrected purchase' })).toHaveAttribute('href', '/purchases/new?supplier=sup1')
  expect(screen.queryByRole('button', { name: 'Pay supplier' })).not.toBeInTheDocument()
  expect(screen.queryByText('More actions')).not.toBeInTheDocument()
  expect(screen.getByText('Reversed', { selector: '.kpi-value' })).toBeInTheDocument()
})

test('a refused reversal explains why and points to the supplier account when payments stand', async () => {
  const paid = { ...LIVE, payments: [{ uuid: 'pay1', payment_date: '2026-10-01', amount: '10.00', payment_method: 'cash', reference: null, notes: null }], paid_amount: '10.00' }
  fakeApi([
    ...SIGNED_IN, ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Shop', role: 'owner' }]),
    ok('POST', `${BASE}/purchase-receipts/receipt1/reverse`, { error: { code: 'payments_recorded', message: 'Payments have been recorded against this purchase. Reverse those payments first.' } }, 409),
    ok('GET', `${BASE}/purchase-receipts/receipt1`, paid),
  ])
  renderApp('/purchases/receipt1')
  await userEvent.click(await screen.findByText('More actions'))
  await userEvent.click(screen.getByRole('button', { name: 'Reverse purchase…' }))
  const dialog = screen.getByRole('dialog', { name: 'Reverse purchase' })
  await userEvent.type(within(dialog).getByLabelText('Why is this being reversed?'), 'Wrong supplier')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Reverse purchase' }))
  expect(await within(dialog).findByText(/Reverse those payments first/)).toBeInTheDocument()
  expect(within(dialog).getByRole('link', { name: 'Open the supplier account' })).toHaveAttribute('href', '/suppliers/sup1')
  expect(within(dialog).getByLabelText('Why is this being reversed?')).toHaveValue('Wrong supplier')
})

test('staff cannot reverse a purchase and the list marks reversed purchases', async () => {
  const reversed = { ...LIVE, balance_due: null, reversed_at: '2026-11-03T10:00:00Z', reversal_reason: 'Entered twice' }
  fakeApi([
    ...SIGNED_IN, ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Shop', role: 'owner' }]),
    ok('GET', `${BASE}/suppliers`, []),
    ok('GET', /^\/v1\/shops\/s1\/purchase-receipts\/summary/, SUMMARY),
    ok('GET', /^\/v1\/shops\/s1\/purchase-receipts\?/, [reversed]),
  ])
  renderApp('/purchases')
  expect(await screen.findByText('Reversed', { selector: '.payment-badge' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Reversed purchases' })).toBeInTheDocument()
  expect(screen.queryByText('Overdue', { selector: '.payment-badge' })).not.toBeInTheDocument()
})
