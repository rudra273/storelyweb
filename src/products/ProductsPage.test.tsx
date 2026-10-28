import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { SIGNED_IN, fakeApi, ok, renderApp } from '../test-utils'
import { canEncode } from '../lib/barcode'

afterEach(() => vi.unstubAllGlobals())

const SHOP = (role: string) => ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Asha Stores', role }])
const CATS = ok('GET', '/v1/shops/s1/categories', [{ uuid: 'c1', name: 'Grains', hsn_code: null, gst_percent: null, product_count: 1 }])
const UNITS = ok('GET', '/v1/shops/s1/units', [{ uuid: 'u1', name: 'kg', product_count: 1 }])

const RICE = {
  uuid: 'p1', name: 'Basmati Rice', product_code: 'R1', barcode: '8901', hsn_code: null,
  category_uuid: 'c1', category_name: 'Grains', unit_uuid: 'u1', unit_name: 'kg',
  selling_price: '25.5', mrp_price: null, gst_percent: null, quantity: '50', track_stock: true,
  reorder_level: '10', low_stock: false, next_expiry: null, updated_at: '2026-10-01T00:00:10Z',
}
const COST = { purchase_price: '18', overhead_cost: '1', profit_margin_percent: null, supplier_uuid: null }
const page = (items: object[], extra: object = {}) => ({ items, total: items.length, next_cursor: null, ...extra })

function setup(role: string, items: object[]) {
  return fakeApi([
    ...SIGNED_IN, SHOP(role), CATS, UNITS,
    ok('GET', /^\/v1\/shops\/s1\/products\?/, page(items)),
    ok('GET', '/v1/shops/s1/products/p1', { product: items[0], movements: [{ uuid: 'm1', type: 'purchase', quantity_delta: '50', reason: null, notes: null, batch_no: null, expiry_date: null, created_at: '2026-10-01T00:00:10Z' }] }),
  ])
}

test('an owner sees cost, and the add, import, export and manage buttons', async () => {
  setup('owner', [{ ...RICE, ...COST }])
  renderApp('/products')
  expect(await screen.findByRole('button', { name: 'Basmati Rice' })).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: 'Cost' })).toBeInTheDocument()
  expect(screen.getByText('₹18.00')).toBeInTheDocument()
  await userEvent.click(screen.getByText('More actions'))
  for (const name of ['Add product', 'Import', 'Export CSV', 'Export Excel', 'Categories & units']) {
    expect(screen.getByRole('button', { name })).toBeInTheDocument()
  }
})

test('staff see products and prices but no cost column and no way to change anything', async () => {
  setup('staff', [RICE])
  renderApp('/products')
  expect(await screen.findByRole('button', { name: 'Basmati Rice' })).toBeInTheDocument()
  expect(screen.queryByRole('columnheader', { name: 'Cost' })).not.toBeInTheDocument()
  expect(screen.getByText('₹25.50')).toBeInTheDocument()
  for (const name of ['Add product', 'Import', 'Export CSV', 'Export Excel', 'Categories & units']) {
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  }
  await userEvent.click(screen.getByRole('button', { name: 'Basmati Rice' }))
  expect(await screen.findByRole('complementary', { name: 'Product details' })).toBeInTheDocument()
  expect(screen.queryByText('Cost price')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Adjust stock' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
})

test('searching, filtering and sorting go to the server as query parameters', async () => {
  const calls = setup('owner', [{ ...RICE, ...COST }])
  renderApp('/products')
  await screen.findByRole('button', { name: 'Basmati Rice' })
  await userEvent.type(screen.getByLabelText('Search products'), 'rice & 100%')
  await userEvent.click(screen.getByLabelText('Low stock'))
  await userEvent.selectOptions(screen.getByLabelText('Category'), 'c1')
  await userEvent.click(screen.getByRole('button', { name: /^Price/ }))
  await waitFor(() => {
    const last = [...calls].reverse().find((c) => c.path.includes('/products?'))!.path
    const q = new URLSearchParams(last.split('?')[1])
    expect(q.get('q')).toBe('rice & 100%')
    expect(q.get('low_stock')).toBe('true')
    expect(q.get('category')).toBe('c1')
    expect(q.get('sort')).toBe('price')
  })
})

test('an empty shop explains what to do, differently for owners and staff', async () => {
  setup('owner', [])
  const view = renderApp('/products')
  expect(await screen.findByText('No products yet')).toBeInTheDocument()
  expect(screen.getByText('Add a product, or import a file.')).toBeInTheDocument()
  view.unmount()
  setup('staff', [])
  renderApp('/products')
  expect(await screen.findByText('Ask the owner to add products.')).toBeInTheDocument()
})

test('paging shows the range and moves with the cursor', async () => {
  const calls = fakeApi([
    ...SIGNED_IN, SHOP('owner'), CATS, UNITS,
    ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST }], { total: 60, next_cursor: '25' })),
  ])
  renderApp('/products')
  expect(await screen.findByText('1–1 of 60')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Next' }))
  await waitFor(() => expect(calls.some((c) => c.path.includes('cursor=25'))).toBe(true))
})

test('the owner can open the detail and sees history, cost and the action buttons', async () => {
  setup('owner', [{ ...RICE, ...COST }])
  renderApp('/products')
  await userEvent.click(await screen.findByRole('button', { name: 'Basmati Rice' }))
  const panel = await screen.findByRole('complementary', { name: 'Product details' })
  expect(within(panel).getByText('Cost price')).toBeInTheDocument()
  expect(await within(panel).findByText('Stock in')).toBeInTheDocument()
  for (const name of ['Edit', 'Adjust stock', 'Delete']) expect(within(panel).getByRole('button', { name })).toBeInTheDocument()
})

test('adding a product sends decimals as strings and rejects typos before calling the server', async () => {
  const calls = setup('owner', [{ ...RICE, ...COST }])
  calls.length = 0
  renderApp('/products')
  await userEvent.click(await screen.findByRole('button', { name: 'Add product' }))
  const form = await screen.findByRole('dialog', { hidden: true })
  await userEvent.type(within(form).getByLabelText('Product name'), 'Tea')
  await userEvent.type(within(form).getByLabelText('Selling price (₹)'), '12,5')
  await userEvent.click(within(form).getByRole('button', { name: 'Add product' }))
  expect(await within(form).findByRole('alert')).toHaveTextContent('Selling price must be a number')
  expect(calls.some((c) => c.method === 'POST' && c.path.endsWith('/products'))).toBe(false)
})

test('barcode labels accept ordinary codes and refuse what Code 128 cannot hold', () => {
  expect(canEncode('8901234567890')).toBe(true)
  expect(canEncode('P3F9A2C1')).toBe(true)
  expect(canEncode('चावल')).toBe(false)
})

test('clearing catalogue filters resets search and server filters', async () => {
  const calls = setup('owner', [{ ...RICE, ...COST }])
  renderApp('/products?q=rice&cat=c1&low=1&exp=1')
  await screen.findByRole('button', { name: 'Basmati Rice' })
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getByLabelText('Search products')).toHaveValue('')
  expect(screen.getByLabelText('Category')).toHaveValue('')
  expect(screen.getByLabelText('Low stock')).not.toBeChecked()
  await waitFor(() => {
    const last = [...calls].reverse().find(c => c.path.includes('/products?'))!.path
    const params = new URLSearchParams(last.split('?')[1])
    expect(params.has('q')).toBe(false)
    expect(params.has('low_stock')).toBe(false)
    expect(params.has('category')).toBe(false)
  })
})

test('category failure is visible and can be retried', async () => {
  const calls = fakeApi([
    ...SIGNED_IN, SHOP('owner'),
    { method: 'GET', path: '/v1/shops/s1/categories', status: 403, body: { error: { code: 'forbidden', message: 'Unavailable' } } },
    ok('GET', /^\/v1\/shops\/s1\/products\?/, page([])),
  ])
  renderApp('/products')
  expect(await screen.findByRole('alert')).toHaveTextContent('Categories could not be loaded')
  const before = calls.filter(c => c.path.endsWith('/categories')).length
  await userEvent.click(screen.getByRole('button', { name: 'Retry categories' }))
  await waitFor(() => expect(calls.filter(c => c.path.endsWith('/categories')).length).toBeGreaterThan(before))
})

test('switching shops clears the previous catalogue, selection and dialogs while loading', async () => {
  const calls = fakeApi([
    ...SIGNED_IN,
    ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Asha Stores', role: 'owner' }, { shop_id: 's2', name: 'Second Shop', role: 'owner' }]),
    CATS, UNITS, ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST }])),
  ])
  const original = globalThis.fetch
  vi.stubGlobal('fetch', (path: string, init: RequestInit) => path.includes('/shops/s2/') ? new Promise<Response>(() => {}) : original(path, init))
  renderApp('/products')
  await userEvent.click(await screen.findByLabelText('Select Basmati Rice'))
  await userEvent.click(screen.getByRole('button', { name: 'Add product' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await userEvent.selectOptions(screen.getByLabelText('Shop'), 's2')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Basmati Rice' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Print labels' })).toBeDisabled()
  expect(calls.length).toBeGreaterThan(0)
})

test('label loading failure is visible and cannot print a partial set', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS,
    ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST }])),
    ok('GET', '/v1/shops/s1/products/p1', { error: { message: 'Unavailable' } }, 403),
  ])
  renderApp('/products')
  await userEvent.click(await screen.findByLabelText('Select Basmati Rice'))
  await userEvent.click(screen.getByRole('button', { name: 'Print labels (1)' }))
  const dialog = screen.getByRole('dialog')
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Some labels could not be loaded')
  expect(within(dialog).getByRole('button', { name: 'Print' })).toBeDisabled()
  expect(within(dialog).getByRole('button', { name: 'Retry labels' })).toBeEnabled()
})

test('an import locks confirmation and file selection while saving', async () => {
  setup('owner', [{ ...RICE, ...COST }])
  const original = globalThis.fetch
  let writes = 0
  vi.stubGlobal('fetch', (path: string, init: RequestInit) => {
    if (path.includes('/products/import?')) {
      if (path.includes('dry_run=true')) return Promise.resolve(new Response(JSON.stringify({ added: 1, updated: 0, skipped: 0, errors: [], more_errors: 0, possible_duplicate: false }), { status: 200 }))
      writes++
      return new Promise<Response>(() => {})
    }
    return original(path, init)
  })
  renderApp('/products')
  await userEvent.click(await screen.findByRole('button', { name: 'Import' }))
  const dialog = screen.getByRole('dialog')
  const file = within(dialog).getByLabelText('CSV or Excel (.xlsx) file, up to 5 MB')
  await userEvent.upload(file, new File(['product_name,quantity,purchase_price\nTea,1,10'], 'products.csv', { type: 'text/csv' }))
  const confirm = await within(dialog).findByRole('button', { name: 'Import 1 product' })
  await userEvent.dblClick(confirm)
  expect(writes).toBe(1)
  expect(file).toBeDisabled()
  expect(within(dialog).getByRole('button', { name: 'Importing…' })).toBeDisabled()
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled()
})

test('stock adjustment rejects invalid quantity and preserves input after server rejection', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS,
    ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST }])),
    ok('GET', '/v1/shops/s1/products/p1', { product: { ...RICE, ...COST }, movements: [] }),
    ok('POST', '/v1/shops/s1/products/p1/stock-adjustments', { error: { message: 'Not enough stock' } }, 409),
  ])
  renderApp('/products')
  await userEvent.click(await screen.findByRole('button', { name: 'Basmati Rice' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Adjust stock' }))
  const dialog = screen.getByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText('Quantity'), '-1')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Enter how many')
  expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/stock-adjustments'))).toBe(false)
  await userEvent.clear(within(dialog).getByLabelText('Quantity'))
  await userEvent.type(within(dialog).getByLabelText('Quantity'), '51.25')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Not enough stock')
  expect(within(dialog).getByLabelText('Quantity')).toHaveValue('51.25')
  expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/stock-adjustments'))?.body).toMatchObject({ delta: '-51.25' })
})

for (const kind of ['product', 'stock']) {
  test(`${kind} saving freezes fields and close controls until completion`, async () => {
    setup('owner', [{ ...RICE, ...COST }])
    const original = globalThis.fetch
    let writes = 0
    vi.stubGlobal('fetch', (path: string, init: RequestInit) => {
      if (init.method === 'POST' && path.includes(kind === 'product' ? '/shops/s1/products' : '/stock-adjustments')) {
        writes++
        return new Promise<Response>(() => {})
      }
      return original(path, init)
    })
    renderApp('/products')
    if (kind === 'product') {
      await userEvent.click(await screen.findByRole('button', { name: 'Add product' }))
      await userEvent.type(screen.getByLabelText('Product name'), 'Tea')
    } else {
      await userEvent.click(await screen.findByRole('button', { name: 'Basmati Rice' }))
      await userEvent.click(await screen.findByRole('button', { name: 'Adjust stock' }))
      await userEvent.type(screen.getByLabelText('Quantity'), '1')
    }
    const dialog = screen.getByRole('dialog')
    await userEvent.dblClick(within(dialog).getByRole('button', { name: kind === 'product' ? 'Add product' : 'Save' }))
    expect(writes).toBe(1)
    expect(within(dialog).getByLabelText(kind === 'product' ? 'Product name' : 'Quantity')).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled()
    expect(fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }))).toBe(false)
    expect(dialog).toBeInTheDocument()
  })
}

test('secondary actions are disclosed and Escape returns focus to their trigger', async () => {
  setup('owner', [{ ...RICE, ...COST }])
  renderApp('/products')
  await screen.findByRole('button', { name: 'Basmati Rice' })
  const trigger = screen.getByText('More actions')
  expect(trigger.closest('details')).not.toHaveAttribute('open')
  await userEvent.click(trigger)
  const exportButton = screen.getByRole('button', { name: 'Export CSV' })
  await userEvent.click(screen.getByRole('button', { name: 'Categories & units' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  await userEvent.click(trigger)
  exportButton.focus()
  await userEvent.keyboard('{Escape}')
  expect(trigger.closest('details')).not.toHaveAttribute('open')
  expect(trigger).toHaveFocus()
})

test('category management cannot close or edit other fields while saving', async () => {
  setup('owner', [{ ...RICE, ...COST }])
  const original = globalThis.fetch
  vi.stubGlobal('fetch', (path: string, init: RequestInit) => init.method === 'POST' && path.endsWith('/categories') ? new Promise<Response>(() => {}) : original(path, init))
  renderApp('/products')
  await screen.findByRole('button', { name: 'Basmati Rice' })
  await userEvent.click(screen.getByText('More actions'))
  await userEvent.click(screen.getByRole('button', { name: 'Categories & units' }))
  const dialog = screen.getByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText('New category'), 'Tea')
  const categories = within(dialog).getByLabelText('New category').closest('section')!
  await userEvent.click(within(categories).getByRole('button', { name: 'Add' }))
  expect(within(dialog).getByLabelText('New category')).toBeDisabled()
  expect(within(dialog).getByLabelText('New unit')).toBeDisabled()
  expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled()
})

test('grouped product fields retain pricing, stock, identifiers and tax in the save request', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS,
    ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST }])),
    ok('POST', '/v1/shops/s1/products', { product: { ...RICE, ...COST }, movements: [] }),
    ok('GET', '/v1/shops/s1/products/p1', { product: { ...RICE, ...COST }, movements: [] }),
  ])
  renderApp('/products')
  await userEvent.click(await screen.findByRole('button', { name: 'Add product' }))
  const dialog = screen.getByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText('Product name'), 'Tea')
  await userEvent.type(within(dialog).getByLabelText('Selling price (₹)'), '25.50')
  await userEvent.type(within(dialog).getByLabelText('Cost price (₹)'), '18.25')
  await userEvent.type(within(dialog).getByLabelText('Opening stock'), '3.5')
  await userEvent.type(within(dialog).getByLabelText('Reorder level'), '2')
  await userEvent.click(within(dialog).getByText('Codes and tax details (optional)'))
  await userEvent.type(within(dialog).getByLabelText('Product code'), 'TEA-01')
  await userEvent.type(within(dialog).getByLabelText('HSN / SAC code'), '0902')
  await userEvent.selectOptions(within(dialog).getByLabelText('GST %'), '5')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Add product' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/products'))?.body).toMatchObject({ name: 'Tea', selling_price: '25.50', purchase_price: '18.25', opening_quantity: '3.5', reorder_level: '2', product_code: 'TEA-01', hsn_code: '0902', gst_percent: '5', track_stock: true })
})
