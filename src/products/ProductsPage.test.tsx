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
  reorder_level: '10', low_stock: false, next_expiry: null, updated_at: '2026-10-01T00:00:10Z', price_mode: 'fixed',
}
const COST = { purchase_price: '18', overhead_cost: '1', profit_margin_percent: null, supplier_uuid: null }
const page = (items: object[], extra: object = {}) => ({ items, total: items.length, next_cursor: null, ...extra })

function setup(role: string, items: object[]) {
  return fakeApi([
    ...SIGNED_IN, SHOP(role), CATS, UNITS,
    ok('GET', '/v1/shops/s1/suppliers', []),
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
  expect(screen.getByText('Add your first product, or import a list from Excel or CSV.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Import a file' })).toBeInTheDocument()
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

test('an unfinished new product comes back after the form is lost, and Start again clears it', async () => {
  setup('owner', [{ ...RICE, ...COST }])
  const first = renderApp('/products')
  await userEvent.click(await screen.findByRole('button', { name: 'Add product' }))
  await userEvent.type(within(await screen.findByRole('dialog', { hidden: true })).getByLabelText('Product name'), 'Tea')
  first.unmount()

  setup('owner', [{ ...RICE, ...COST }])
  renderApp('/products')
  await userEvent.click(await screen.findByRole('button', { name: 'Add product' }))
  const form = await screen.findByRole('dialog', { hidden: true })
  expect(within(form).getByLabelText('Product name')).toHaveValue('Tea')
  expect(within(form).getByText(/unfinished product from/)).toBeInTheDocument()
  await userEvent.click(within(form).getByRole('button', { name: 'Start again' }))
  expect(within(form).getByLabelText('Product name')).toHaveValue('')
  expect(Object.keys(localStorage).filter(k => k.startsWith('storely.draft.product'))).toEqual([])
  // A form that is blank again closes without asking to discard anything.
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await userEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
  expect(confirm).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument())
  confirm.mockRestore()
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
  expect(screen.queryByRole('button', { name: 'Print labels' })).not.toBeInTheDocument()
  expect(screen.getAllByRole('status')[0]).toHaveTextContent('Opening your workspace')
  expect(calls.length).toBeGreaterThan(0)
})

test('label loading failure is visible and cannot print a partial set', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS,
    ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST }])),
    ok('POST', '/v1/shops/s1/products/label-data', { error: { message: 'Unavailable' } }, 403),
  ])
  renderApp('/products')
  await userEvent.click(await screen.findByLabelText('Select Basmati Rice'))
  await userEvent.click(screen.getAllByRole('button', { name: /Print labels/ })[0]!)
  const dialog = screen.getByRole('dialog')
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Labels could not be loaded')
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
  await userEvent.click(within(dialog).getByRole('button', { name: 'Adjust stock' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Enter how many')
  expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/stock-adjustments'))).toBe(false)
  // More than is on the shelf (50) is stopped on screen, with the reason, before the server is asked.
  await userEvent.clear(within(dialog).getByLabelText('Quantity'))
  await userEvent.type(within(dialog).getByLabelText('Quantity'), '51.25')
  expect(within(dialog).getByRole('status')).toHaveTextContent('below zero: only 50 is on the shelf')
  expect(within(dialog).getByRole('button', { name: 'Adjust stock' })).toBeDisabled()
  expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/stock-adjustments'))).toBe(false)
  // An amount that looks fine can still be refused (the stock may have changed): the input is kept.
  await userEvent.clear(within(dialog).getByLabelText('Quantity'))
  await userEvent.type(within(dialog).getByLabelText('Quantity'), '40')
  expect(within(dialog).getByRole('status')).toHaveTextContent('50 now, 10 after this goes out')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Adjust stock' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Not enough stock')
  expect(within(dialog).getByLabelText('Quantity')).toHaveValue('40')
  expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/stock-adjustments'))?.body).toMatchObject({ delta: '-40' })
})

test('a category with its own GST can be created from the product form and is selected', async () => {
  const made = { uuid: 'c2', name: 'Biscuits', hsn_code: null, gst_percent: '18', product_count: 0 }
  const calls = fakeApi([
    ...SIGNED_IN, SHOP('owner'), CATS, UNITS,
    ok('GET', '/v1/shops/s1/suppliers', []),
    ok('GET', /^\/v1\/shops\/s1\/products\?/, page([])),
    ok('POST', '/v1/shops/s1/categories', made, 201),
  ])
  renderApp('/products')
  await userEvent.click(await screen.findByRole('button', { name: 'Add product' }))
  await userEvent.type(screen.getByLabelText('Product name'), 'Marie')
  await userEvent.click(screen.getByRole('button', { name: '+ New category' }))
  const editor = screen.getByRole('dialog', { name: 'New category' })
  await userEvent.type(within(editor).getByLabelText('Category name'), 'Biscuits')
  await userEvent.selectOptions(within(editor).getByLabelText('GST % (optional)'), '18')
  await userEvent.click(within(editor).getByRole('button', { name: 'Add category' }))
  expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/categories'))?.body).toEqual({ name: 'Biscuits', gst_percent: '18', hsn_code: null })
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New category' })).not.toBeInTheDocument())
  expect(screen.getByLabelText('Product name')).toHaveValue('Marie')
})

test('a product without a selling price is stopped with a message on the price field', async () => {
  const calls = setup('owner', [{ ...RICE, ...COST }])
  renderApp('/products')
  await userEvent.click(await screen.findByRole('button', { name: 'Add product' }))
  const dialog = await screen.findByRole('dialog', { hidden: true })
  await userEvent.type(within(dialog).getByLabelText('Product name'), 'Tea')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Add product' }))
  expect(within(dialog).getByLabelText('Selling price (₹)')).toHaveAttribute('aria-invalid', 'true')
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter the price you sell this product at.')
  expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/products'))).toBe(false)
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
      await userEvent.type(screen.getByLabelText('Selling price (₹)'), '20')
    } else {
      await userEvent.click(await screen.findByRole('button', { name: 'Basmati Rice' }))
      await userEvent.click(await screen.findByRole('button', { name: 'Adjust stock' }))
      await userEvent.type(screen.getByLabelText('Quantity'), '1')
    }
    const dialog = screen.getByRole('dialog')
    await userEvent.dblClick(within(dialog).getByRole('button', { name: kind === 'product' ? 'Add product' : 'Adjust stock' }))
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
  await userEvent.click(within(dialog).getByText('Codes and HSN (optional)'))
  await userEvent.type(within(dialog).getByLabelText('Product code'), 'TEA-01')
  await userEvent.type(within(dialog).getByLabelText('HSN / SAC code'), '0902')
  await userEvent.selectOptions(within(dialog).getByLabelText('GST rate'), '5')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Add product' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/products'))?.body).toMatchObject({ name: 'Tea', selling_price: '25.50', purchase_price: '18.25', opening_quantity: '3.5', reorder_level: '2', product_code: 'TEA-01', hsn_code: '0902', gst_percent: '5', track_stock: true, price_mode: 'fixed' })
})

test('a cost + margin product shows the server breakdown, including where GST came from', async () => {
  const shown = { price_mode: 'formula', selling_price: '129.80', pre_gst_selling_price: '129.80', output_gst_amount: '0.00', purchase_price: '100.00', purchase_gst_amount: '18.00', overhead_cost: '0.00', total_cost: '118.00', cost_known: true, profit_margin_percent: '10', profit_amount: '11.80', gst_percent: '18', gst_source: 'shop', category_name: null, gst_registered: false }
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS,
    ok('GET', '/v1/shops/s1/suppliers', []),
    ok('GET', /^\/v1\/shops\/s1\/products\?/, page([])),
    ok('POST', '/v1/shops/s1/products/price-preview', shown),
    ok('POST', '/v1/shops/s1/products', { product: { ...RICE, ...COST }, movements: [] }),
    ok('GET', '/v1/shops/s1/products/p1', { product: { ...RICE, ...COST }, movements: [] }),
  ])
  renderApp('/products')
  await userEvent.click(await screen.findByRole('button', { name: 'Add product' }))
  const dialog = screen.getByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText('Product name'), 'Tea')
  await userEvent.click(within(dialog).getByLabelText('Work it out from cost + margin'))
  expect(within(dialog).queryByLabelText('Selling price (₹)')).not.toBeInTheDocument()
  await userEvent.type(within(dialog).getByLabelText('Cost price (₹)'), '100')
  await userEvent.type(within(dialog).getByLabelText('Margin (%)'), '10')
  expect(await within(dialog).findByText('+ GST paid on purchase (18%, your shop default)')).toBeInTheDocument()
  expect(within(dialog).getByText('₹129.80')).toBeInTheDocument()
  expect(calls.filter(c => c.path.endsWith('/price-preview')).at(-1)?.body).toMatchObject({ price_mode: 'formula', purchase_price: '100', profit_margin_percent: '10', selling_price: null })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Add product' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  const body = calls.find(c => c.method === 'POST' && c.path.endsWith('/s1/products'))?.body as Record<string, unknown>
  expect(body).toMatchObject({ price_mode: 'formula', purchase_price: '100', profit_margin_percent: '10' })
  expect(body).not.toHaveProperty('selling_price')
})

test('the product panel shows how it is priced and where its GST rate comes from', async () => {
  const pricing = { price_mode: 'fixed', selling_price: '25.50', pre_gst_selling_price: '25.50', output_gst_amount: '0.00', purchase_price: '18.00', purchase_gst_amount: '0.90', overhead_cost: '1.00', total_cost: '19.90', cost_known: true, profit_margin_percent: '0', profit_amount: '5.60', gst_percent: '5', gst_source: 'category', category_name: 'Grains', gst_registered: false }
  fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS,
    ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST, price_mode: 'fixed' }])),
    ok('GET', '/v1/shops/s1/products/p1', { product: { ...RICE, ...COST, price_mode: 'fixed' }, movements: [], pricing }),
  ])
  renderApp('/products/p1')
  const panel = await screen.findByRole('complementary', { name: 'Product details' })
  expect(await within(panel).findByText('5% · from Grains')).toBeInTheDocument()
  expect(within(panel).getByText('Selling price you set')).toBeInTheDocument()
  expect(within(panel).getByText('Profit per unit')).toBeInTheDocument()
})


test('a product with no cost price shows no profit', async () => {
  const pricing = { price_mode: 'fixed', selling_price: '40.00', pre_gst_selling_price: '40.00', output_gst_amount: '0.00', purchase_price: '0.00', purchase_gst_amount: '0.00', overhead_cost: '0.00', total_cost: '0.00', cost_known: false, profit_margin_percent: '0', profit_amount: null, gst_percent: '0', gst_source: 'shop', category_name: null, gst_registered: false }
  fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS,
    ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST, price_mode: 'fixed' }])),
    ok('GET', '/v1/shops/s1/products/p1', { product: { ...RICE, ...COST, price_mode: 'fixed' }, movements: [], pricing }),
  ])
  renderApp('/products/p1')
  const panel = await screen.findByRole('complementary', { name: 'Product details' })
  expect(await within(panel).findByText('Add a cost price to see profit.')).toBeInTheDocument()
  expect(within(panel).queryByText('Profit per unit')).not.toBeInTheDocument()
})

const PATCHED = ok('PATCH', '/v1/shops/s1/products/p1', { product: { ...RICE, selling_price: '30' }, movements: [] })
const patches = (calls: { method: string; path: string; body: unknown }[]) => calls.filter(c => c.method === 'PATCH')
const owner = (extra: object[] = [PATCHED], item: object = { ...RICE, ...COST }) => fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, ok('GET', '/v1/shops/s1/suppliers', []), ok('GET', /^\/v1\/shops\/s1\/products\?/, page([item])), ...(extra as never[])])
const editRice = async () => userEvent.click(await screen.findByRole('button', { name: 'Edit Basmati Rice' }))
const fieldNamed = (name: string) => screen.getByRole('textbox', { name })

test('each row has an edit icon, and nothing in the table can be typed into until it is clicked', async () => {
  owner()
  renderApp('/products')
  const edit = await screen.findByRole('button', { name: 'Edit Basmati Rice' })
  expect(edit).toHaveTextContent('')            // an icon, not the word Edit
  expect(edit.querySelector('svg')).not.toBeNull()
  expect(screen.queryByRole('textbox', { name: /Basmati Rice/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: /Basmati Rice/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Save|Confirm/ })).not.toBeInTheDocument()
})

test('clicking the icon makes this row editable and the same button becomes Save', async () => {
  owner()
  renderApp('/products')
  await editRice()
  expect(fieldNamed('Name of Basmati Rice')).toHaveFocus()
  expect(fieldNamed('Price of Basmati Rice')).toHaveValue('25.5')
  expect(fieldNamed('Reorder level of Basmati Rice')).toHaveValue('10')
  expect(screen.getByRole('combobox', { name: 'Category of Basmati Rice' })).toHaveValue('c1')
  expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit Basmati Rice' })).not.toBeInTheDocument()
  // Stock is never a field.
  expect(screen.queryByRole('textbox', { name: /stock|quantity/i })).not.toBeInTheDocument()
})

test('a price change shows its effect first, then saves only what changed, and says Saved', async () => {
  const calls = owner()
  renderApp('/products')
  await editRice()
  const price = fieldNamed('Price of Basmati Rice')
  await userEvent.clear(price)
  await userEvent.type(price, '30{Enter}')
  expect(patches(calls)).toHaveLength(0)   // not sent until the effect is confirmed
  expect(screen.getByRole('status')).toHaveTextContent('₹25.50 to ₹30.00')
  expect(screen.getByRole('status')).toHaveTextContent('saved invoices keep theirs')
  expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  await waitFor(() => expect(patches(calls)).toHaveLength(1))
  expect(patches(calls)[0]?.body).toEqual({ price_mode: 'fixed', selling_price: '30', expected_updated_at: RICE.updated_at })
  expect(await screen.findByText('Saved')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Basmati Rice' })).toHaveFocus())
})

test('name, category and reorder level save together without a price review', async () => {
  const calls = owner()
  renderApp('/products')
  await editRice()
  const name = fieldNamed('Name of Basmati Rice')
  await userEvent.clear(name)
  await userEvent.type(name, 'Basmati Rice 5 kg')
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Category of Basmati Rice' }), 'No category')
  const reorder = fieldNamed('Reorder level of Basmati Rice')
  await userEvent.clear(reorder)
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(patches(calls)).toHaveLength(1))
  expect(patches(calls)[0]?.body).toEqual({ name: 'Basmati Rice 5 kg', category_uuid: null, reorder_level: null, expected_updated_at: RICE.updated_at })
})

test('Escape and Cancel leave the row as it was and send nothing', async () => {
  const calls = owner()
  renderApp('/products')
  await editRice()
  await userEvent.type(fieldNamed('Price of Basmati Rice'), '99{Escape}')
  expect(screen.queryByRole('textbox', { name: /Price of/ })).not.toBeInTheDocument()
  expect(screen.getByText('₹25.50')).toBeInTheDocument()
  await editRice()
  await userEvent.type(fieldNamed('Name of Basmati Rice'), ' changed')
  await userEvent.click(screen.getByRole('button', { name: 'Cancel editing Basmati Rice' }))
  expect(screen.getByRole('button', { name: 'Basmati Rice' })).toBeInTheDocument()
  expect(patches(calls)).toHaveLength(0)
})

test('Save with nothing changed just closes the row', async () => {
  const calls = owner()
  renderApp('/products')
  await editRice()
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.getByRole('button', { name: 'Edit Basmati Rice' })).toBeInTheDocument()
  expect(patches(calls)).toHaveLength(0)
})

test('a bad price or an empty name is explained and kept for fixing; a price under cost is called out', async () => {
  const calls = owner()
  renderApp('/products')
  await editRice()
  const price = fieldNamed('Price of Basmati Rice')
  await userEvent.clear(price)
  await userEvent.type(price, 'abc{Enter}')
  expect(screen.getByRole('alert')).toHaveTextContent('Enter the price')
  expect(price).toHaveValue('abc')
  await userEvent.clear(price)
  await userEvent.type(price, '10{Enter}')
  expect(screen.getByRole('status')).toHaveTextContent('below your cost of ₹18.00')
  await userEvent.click(screen.getByRole('button', { name: 'Go back and keep editing' }))
  await userEvent.clear(fieldNamed('Name of Basmati Rice'))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.getByRole('alert')).toHaveTextContent('needs a name')
  expect(patches(calls)).toHaveLength(0)
})

test('a formula-priced product shows how it is priced and its price is never a field', async () => {
  owner([PATCHED], { ...RICE, ...COST, price_mode: 'formula' })
  renderApp('/products')
  await editRice()
  expect(screen.queryByRole('textbox', { name: 'Price of Basmati Rice' })).not.toBeInTheDocument()
  expect(screen.getByText(/from cost \+ margin/)).toBeInTheDocument()
})

test('someone else changing the product first is explained, nothing typed is lost, and saving again is a choice', async () => {
  const conflict = ok('PATCH', '/v1/shops/s1/products/p1', { error: { code: 'changed_elsewhere', message: 'Someone changed this product after you opened it. Check the current values and save again.' } }, 409)
  const calls = owner([conflict])
  renderApp('/products')
  await editRice()
  const reorder = fieldNamed('Reorder level of Basmati Rice')
  await userEvent.clear(reorder)
  await userEvent.type(reorder, '20{Enter}')
  expect(await screen.findByRole('alert')).toHaveTextContent('Someone changed this product')
  expect(reorder).toHaveValue('20')
  await waitFor(() => expect(calls.filter(c => c.path.startsWith('/v1/shops/s1/products?')).length).toBeGreaterThan(1))
})

test('staff have no edit icons', async () => {
  setup('staff', [RICE])
  renderApp('/products')
  await screen.findByRole('button', { name: 'Basmati Rice' })
  expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument()
})


// ── selecting products and changing many at once ──

const MORE = Array.from({ length: 3 }, (_, i) => ({ ...RICE, uuid: `p${i + 2}`, name: `Item ${i + 2}`, product_code: `X${i}`, barcode: null }))
const TWO_PAGES = ok('GET', /^\/v1\/shops\/s1\/products\?/, (path: string) => path.includes('cursor=25') ? { items: [{ ...RICE, uuid: 'p9', name: 'Page two item' }], total: 30, next_cursor: null } : { items: [{ ...RICE, ...COST }, ...MORE], total: 30, next_cursor: '25' })
const REVIEW = { applied: false, replayed: false, action: 'price_change', matched: 1, will_change: 1, unchanged: 0, missing: 0, skipped: [], skipped_total: 0, sample: [{ uuid: 'p1', name: 'Basmati Rice', before: '25.50', after: '28.05' }], notes: ['New invoices use the new prices. Saved invoices keep the price they were sold at.'], below_cost: 0, fingerprint: 'abc123' }
const bulkCalls = (calls: { method: string; path: string; body: unknown; headers: Headers }[]) => calls.filter(c => c.path.endsWith('/products/bulk'))

test('the header checkbox selects this page and offers every matching product separately', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, TWO_PAGES])
  renderApp('/products')
  await userEvent.click(await screen.findByLabelText('Select all products on this page'))
  expect(screen.getByText(/All 4 products on this page are selected/)).toBeInTheDocument()
  expect(screen.getByLabelText('Select Basmati Rice')).toBeChecked()
  await userEvent.click(screen.getByRole('button', { name: 'Select all 30 matching products' }))
  expect(screen.getByText(/All/, { selector: 'p' })).toHaveTextContent('All 30 products matching your search and filters are selected')
  // Rows follow the selection; they cannot be unticked one by one until it is cleared.
  expect(screen.getByLabelText('Select Basmati Rice')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Print labels (30)' })).toBeEnabled()
  await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
  expect(screen.queryByRole('region', { name: 'Selected products' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Select Basmati Rice')).not.toBeChecked()
})

test('the header shows some, then all, and unticking it takes the page off', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, TWO_PAGES])
  renderApp('/products')
  const header = await screen.findByLabelText('Select all products on this page') as HTMLInputElement
  await userEvent.click(screen.getByLabelText('Select Basmati Rice'))
  expect(header.indeterminate).toBe(true)
  await userEvent.click(header)
  expect(header.checked).toBe(true)
  await userEvent.click(header)
  expect(header.checked).toBe(false)
  expect(screen.queryByRole('region', { name: 'Selected products' })).not.toBeInTheDocument()
})

test('a selection survives going to the next page, and says how many are chosen', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, TWO_PAGES])
  renderApp('/products')
  await userEvent.click(await screen.findByLabelText('Select all products on this page'))
  await userEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByRole('button', { name: 'Page two item' })
  await userEvent.click(screen.getByLabelText('Select Page two item'))
  expect(screen.getByRole('region', { name: 'Selected products' })).toHaveTextContent('5 selected')
})

test('changing the search clears the selection and says why', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, TWO_PAGES])
  renderApp('/products')
  await userEvent.click(await screen.findByLabelText('Select all products on this page'))
  await userEvent.click(screen.getByLabelText('Low stock'))
  expect(await screen.findByText(/Your selection of 4 products was cleared because the search or filters changed/)).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Selected products' })).not.toBeInTheDocument()
})

test('a bulk price change is reviewed by the server first, then applied exactly as reviewed', async () => {
  const seen: { body: Record<string, unknown>; key: string | null }[] = []
  fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST }]))])
  const base = globalThis.fetch
  vi.stubGlobal('fetch', (path: string, init: RequestInit) => {
    if (!path.endsWith('/products/bulk')) return base(path, init)
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    seen.push({ body, key: new Headers(init.headers).get('Idempotency-Key') })
    return Promise.resolve(new Response(JSON.stringify(body.dry_run ? REVIEW : { ...REVIEW, applied: true }), { status: 200 }))
  })
  renderApp('/products')
  await userEvent.click(await screen.findByLabelText('Select Basmati Rice'))
  await userEvent.click(screen.getByRole('button', { name: 'Change prices' }))
  const dialog = screen.getByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText('Change by (%)'), '10')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Review change' }))
  await userEvent.click(await within(dialog).findByRole('button', { name: 'Change prices of 1 product' }))
  await within(dialog).findByText('Done')
  expect(seen).toHaveLength(2)
  expect(seen[0]?.body).toEqual({ scope: { ids: ['p1'] }, action: { type: 'price_change', mode: 'percent', value: '10' }, dry_run: true })
  expect(seen[1]?.body).toEqual({ scope: { ids: ['p1'] }, action: { type: 'price_change', mode: 'percent', value: '10' }, dry_run: false, expected: { matched: 1, will_change: 1, fingerprint: 'abc123' } })
  expect(seen[1]?.key).toMatch(/[0-9a-f-]{20,}/)
})

test('products left alone are listed with the reason and can be downloaded', async () => {
  const left = { ...REVIEW, matched: 3, will_change: 1, unchanged: 0, skipped_total: 2, skipped: [{ uuid: 'f1', name: 'Formula Tea', reason: 'Priced from cost and margin. Change its cost or margin instead.' }, { uuid: 'f2', name: 'Formula Oil', reason: 'Priced from cost and margin. Change its cost or margin instead.' }] }
  fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST }])), ok('POST', '/v1/shops/s1/products/bulk', left)])
  const created = vi.fn(() => 'blob:x')
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }))
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  renderApp('/products')
  await userEvent.click(await screen.findByLabelText('Select Basmati Rice'))
  await userEvent.click(screen.getByRole('button', { name: 'Change prices' }))
  const dialog = screen.getByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText('Change by (%)'), '5')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Review change' }))
  const list = await within(dialog).findByRole('region', { name: 'Left alone' })
  expect(list).toHaveTextContent('Formula Tea')
  expect(list).toHaveTextContent('Priced from cost and margin')
  expect(within(dialog).getByRole('group', { name: 'Summary' })).toHaveTextContent('Left alone2')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Download the full list (CSV)' }))
  expect(click).toHaveBeenCalledTimes(1)
  click.mockRestore()
})

test('a review that has gone stale is refused with a way to review again', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST }]))])
  const base = globalThis.fetch
  vi.stubGlobal('fetch', (path: string, init: RequestInit) => {
    if (!path.endsWith('/products/bulk')) return base(path, init)
    return Promise.resolve(JSON.parse(String(init.body)).dry_run
      ? new Response(JSON.stringify(REVIEW), { status: 200 })
      : new Response(JSON.stringify({ error: { code: 'scope_changed', message: 'The products changed since you reviewed this. Review the change again.' } }), { status: 409 }))
  })
  renderApp('/products')
  await userEvent.click(await screen.findByLabelText('Select Basmati Rice'))
  await userEvent.click(screen.getByRole('button', { name: 'Change prices' }))
  const dialog = screen.getByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText('Change by (%)'), '10')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Review change' }))
  await userEvent.click(await within(dialog).findByRole('button', { name: 'Change prices of 1 product' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('changed since you reviewed')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Review again' }))
  expect(within(dialog).getByRole('button', { name: 'Review change' })).toBeInTheDocument()
})

test('a bad number is explained before anything is asked of the server', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST }]))])
  renderApp('/products')
  await userEvent.click(await screen.findByLabelText('Select Basmati Rice'))
  await userEvent.click(screen.getByRole('button', { name: 'Change prices' }))
  const dialog = screen.getByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText('Change by (%)'), 'lots')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Review change' }))
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter the change as a number')
  await userEvent.clear(within(dialog).getByLabelText('Change by (%)'))
  await userEvent.type(within(dialog).getByLabelText('Change by (%)'), '-100')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Review change' }))
  expect(within(dialog).getByRole('alert')).toHaveTextContent('cannot fall by 100%')
  expect(bulkCalls(calls)).toHaveLength(0)
})

test('archiving is called archiving and uses the danger button', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST }])), ok('POST', '/v1/shops/s1/products/bulk', { ...REVIEW, action: 'archive', sample: [], notes: [] })])
  renderApp('/products')
  await userEvent.click(await screen.findByLabelText('Select Basmati Rice'))
  await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveTextContent('Past invoices keep them')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Review change' }))
  expect(await within(dialog).findByRole('button', { name: 'Archive 1 product' })).toHaveClass('danger-button')
})

test('staff can select products for labels but have no way to change them', async () => {
  setup('staff', [RICE])
  renderApp('/products')
  await userEvent.click(await screen.findByLabelText('Select Basmati Rice'))
  const bar = screen.getByRole('region', { name: 'Selected products' })
  expect(within(bar).getByRole('button', { name: 'Print labels' })).toBeInTheDocument()
  for (const name of ['Change category', 'Set reorder level', 'Change prices', 'Archive']) expect(within(bar).queryByRole('button', { name })).not.toBeInTheDocument()
})

test('labels for every matching product ask the server for the filter, not just the page', async () => {
  // jsdom has no canvas; the barcode library only needs it to measure text.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText: () => ({ width: 10 }) } as unknown as CanvasRenderingContext2D)
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, TWO_PAGES, ok('POST', '/v1/shops/s1/products/label-data', [{ uuid: 'p1', name: 'Basmati Rice', product_code: 'R1', barcode: '8901', selling_price: '25.5' }])])
  renderApp('/products')
  await userEvent.click(await screen.findByLabelText('Select all products on this page'))
  await userEvent.click(screen.getByRole('button', { name: 'Select all 30 matching products' }))
  await userEvent.click(screen.getAllByRole('button', { name: /Print labels/ })[0]!)
  await screen.findByLabelText('Label preview')
  const sent = calls.find(c => c.path.endsWith('/label-data'))
  expect(sent?.body).toEqual({ scope: { filter: { q: null, category: null, low_stock: false, expiring_days: null, no_code: false, out_of_stock: false } } })
})

// ── codes and labels ──

const TEA = { ...RICE, uuid: 'p7', name: 'Tea', product_code: 'ST-000007', barcode: null }

test('a product added without a code is shown its generated code, with the label offered at once', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText: () => ({ width: 10 }) } as unknown as CanvasRenderingContext2D)
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, ok('GET', '/v1/shops/s1/suppliers', []),
    ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST }])),
    ok('POST', '/v1/shops/s1/products', { product: TEA, movements: [] }, 201),
    ok('GET', '/v1/shops/s1/products/p7', { product: TEA, movements: [] }),
    ok('POST', '/v1/shops/s1/products/label-data', [{ uuid: 'p7', name: 'Tea', product_code: 'ST-000007', barcode: null, selling_price: '12' }])])
  renderApp('/products')
  await userEvent.click(await screen.findByRole('button', { name: 'Add product' }))
  const form = await screen.findByRole('dialog', { hidden: true })
  expect(within(form).getByText(/Leave the code and barcode empty and Storely gives this product a code of its own/)).toBeInTheDocument()
  await userEvent.type(within(form).getByLabelText('Product name'), 'Tea')
  await userEvent.type(within(form).getByLabelText('Selling price (₹)'), '12')
  await userEvent.click(within(form).getByRole('button', { name: 'Add product' }))
  const panel = await screen.findByRole('complementary', { name: 'Product details' })
  const banner = await within(panel).findByText(/Product added\./)
  expect(banner.closest('[role]') ?? banner.parentElement).toHaveTextContent('ST-000007')
  await userEvent.click(within(panel).getAllByRole('button', { name: 'Print label' })[0]!)
  await screen.findByLabelText('Label preview')
  expect(calls.find(c => c.path.endsWith('/label-data'))?.body).toEqual({ scope: { ids: ['p7'] } })
  // The create request sent no code of its own: the server makes it.
  const created = calls.find(c => c.method === 'POST' && c.path === '/v1/shops/s1/products')?.body as Record<string, unknown>
  expect(created.product_code).toBeNull()
  expect(created.barcode).toBeNull()
})

test('a product with no code says so and points at Assign codes; one with a code offers its label', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST, product_code: null, barcode: null }])),
    ok('GET', '/v1/shops/s1/products/p1', { product: { ...RICE, ...COST, product_code: null, barcode: null }, movements: [] })])
  renderApp('/products')
  await userEvent.click(await screen.findByRole('button', { name: 'Basmati Rice' }))
  const panel = await screen.findByRole('complementary', { name: 'Product details' })
  expect(await within(panel).findByText(/no barcode or code, so it cannot be scanned or labelled/)).toBeInTheDocument()
  expect(within(panel).queryByRole('button', { name: 'Print label' })).not.toBeInTheDocument()
})

test('products without a code can be listed and given one, reviewed first', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST, product_code: null, barcode: null }])),
    ok('POST', '/v1/shops/s1/products/bulk', { ...REVIEW, action: 'assign_codes', sample: [{ uuid: 'p1', name: 'Basmati Rice', before: 'No code', after: 'ST-000001' }], notes: ['Codes are internal to your shop (they are not retail barcodes). A code is never reused, even if its product is deleted.'], below_cost: null })])
  renderApp('/products')
  await userEvent.click(await screen.findByLabelText('No barcode or code'))
  await waitFor(() => expect(calls.some(c => c.path.includes('no_code=true'))).toBe(true))
  await userEvent.click(await screen.findByLabelText('Select Basmati Rice'))
  await userEvent.click(screen.getByRole('button', { name: 'Assign codes' }))
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveTextContent('already have either are left as they are')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Review change' }))
  expect(await within(dialog).findByText('ST-000001')).toBeInTheDocument()
  expect(within(dialog).getByText(/not retail barcodes/)).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Give codes to 1 product' })).toBeInTheDocument()
  expect(calls.find(c => c.path.endsWith('/products/bulk'))?.body).toEqual({ scope: { ids: ['p1'] }, action: { type: 'assign_codes' }, dry_run: true })
})

test('staff do not get the missing-code filter or the Assign codes action', async () => {
  setup('staff', [RICE])
  renderApp('/products')
  await userEvent.click(await screen.findByLabelText('Select Basmati Rice'))
  expect(screen.queryByLabelText('No barcode or code')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Assign codes' })).not.toBeInTheDocument()
})

// ── stock history and stock views ──

const ENTRY = (over: object) => ({ uuid: 'm', type: 'sale', quantity_delta: '-3', balance_after: '47', reason: null, notes: null, batch_no: null, expiry_date: null, created_at: '2026-10-05T10:00:00', source: null, ...over })
const LEDGER = {
  items: [
    ENTRY({ uuid: 'm3', type: 'adjustment', quantity_delta: '-2', balance_after: '47', reason: 'damage', created_at: '2026-10-06T09:00:00Z' }),
    ENTRY({ uuid: 'm2', quantity_delta: '-3', balance_after: '49', source: { kind: 'bill', uuid: 'b1', label: 'INV/2627/0001' } }),
    ENTRY({ uuid: 'm1', type: 'purchase', quantity_delta: '52', balance_after: '52', created_at: '2026-10-01T12:00:00+05:30', source: { kind: 'purchase', uuid: 'r1', label: 'Asha Traders · 118' } }),
  ],
  total: 5, on_hand: '47', next_cursor: '3',
}
const ledgerApi = (extra: object[] = []) => fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS,
  ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST }])),
  ok('GET', '/v1/shops/s1/products/p1', { product: { ...RICE, ...COST }, movements: [] }),
  ...(extra as never[]),
  ok('GET', /\/products\/p1\/movements\?/, (path: string) => path.includes('cursor=3') ? { items: [ENTRY({ uuid: 'm0', type: 'adjustment', quantity_delta: '50', balance_after: '50', reason: 'count', created_at: '2026-09-20T09:00:00' })], total: 5, on_hand: '47', next_cursor: null } : LEDGER)])

async function openLedger() {
  await userEvent.click(await screen.findByRole('button', { name: 'Basmati Rice' }))
  await userEvent.click(await screen.findByRole('button', { name: 'See the full history' }))
  return screen.getByRole('dialog')
}

test('the full history lists every entry with its source and the balance after it, a page at a time', async () => {
  const calls = ledgerApi()
  renderApp('/products')
  const dialog = await openLedger()
  expect(await within(dialog).findByText('Adjusted · Damaged')).toBeInTheDocument()
  expect(within(dialog).getByText(/On the shelf now:/)).toHaveTextContent('47')
  expect(within(dialog).getByRole('link', { name: 'INV/2627/0001' })).toHaveAttribute('href', '/billing/b1')
  expect(within(dialog).getByRole('link', { name: 'Asha Traders · 118' })).toHaveAttribute('href', '/purchases')
  const rows = within(dialog).getAllByRole('row').slice(1)
  expect(rows[0]).toHaveTextContent('-2')
  expect(rows[0]).toHaveTextContent('47')
  expect(rows[2]).toHaveTextContent('+52')
  expect(within(dialog).getByText('Showing 3 of 5')).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Show older entries' }))
  expect(await within(dialog).findByText('Showing 4 of 5')).toBeInTheDocument()
  expect(calls.some(c => c.path.includes('/movements?') && c.path.includes('cursor=3'))).toBe(true)
})

test('history filters are sent to the server and can be cleared', async () => {
  const calls = ledgerApi()
  renderApp('/products')
  const dialog = await openLedger()
  await within(dialog).findByText('Showing 3 of 5')
  await userEvent.selectOptions(within(dialog).getByLabelText('What happened'), 'sale')
  await waitFor(() => expect(calls.some(c => c.path.includes('/movements?') && c.path.includes('type=sale'))).toBe(true))
  await userEvent.type(within(dialog).getByLabelText('From'), '2026-10-01')
  await waitFor(() => expect(calls.some(c => c.path.includes('from=2026-10-01'))).toBe(true))
  await userEvent.click(within(dialog).getByRole('button', { name: 'Clear filters' }))
  expect(within(dialog).getByLabelText('What happened')).toHaveValue('')
})

const withLedgerReply = (reply: object, status = 200) => fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST }])),
  ok('GET', '/v1/shops/s1/products/p1', { product: { ...RICE, ...COST }, movements: [] }), ok('GET', /\/movements\?/, reply, status)])

test('a history that cannot be read says so and can be retried', async () => {
  withLedgerReply({ error: { code: 'internal_error', message: 'Could not read the history.' } }, 500)
  renderApp('/products')
  const dialog = await openLedger()
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not read the history.')
  expect(within(dialog).getByRole('button', { name: 'Retry history' })).toBeEnabled()
})

test('a product with no movements says so, and a filter with no matches says that instead', async () => {
  withLedgerReply({ items: [], total: 0, on_hand: '0', next_cursor: null })
  renderApp('/products')
  const dialog = await openLedger()
  expect(await within(dialog).findByText('No stock movements yet')).toBeInTheDocument()
  await userEvent.selectOptions(within(dialog).getByLabelText('What happened'), 'void')
  expect(await within(dialog).findByText('Nothing matches these filters')).toBeInTheDocument()
})

test('stock views show how many products are in each, and Out of stock filters the list', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS,
    ok('GET', /^\/v1\/shops\/s1\/products\/stock-summary$/, { all: 40, low: 6, out: 2, expiring: 3, no_code: 0 }),
    ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST, quantity: '0', low_stock: true }]))])
  renderApp('/products')
  expect(await screen.findByLabelText(/Low stock \(6\)/)).toBeInTheDocument()
  expect(screen.getByLabelText(/Expiring in 30 days \(3\)/)).toBeInTheDocument()
  await userEvent.click(screen.getByLabelText(/Out of stock \(2\)/))
  await waitFor(() => expect(calls.some(c => c.path.startsWith('/v1/shops/s1/products?') && c.path.includes('out_of_stock=true'))).toBe(true))
  expect(await screen.findByText(/running low or have run out/)).toBeInTheDocument()
})

test('a low product has a Restock shortcut that opens the purchase composer', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, ok('GET', '/v1/shops/s1/suppliers', []),
    ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST, quantity: '2', low_stock: true }]))])
  renderApp('/products')
  await userEvent.click(await screen.findByRole('button', { name: 'Restock Basmati Rice' }))
  expect(await screen.findByRole('dialog', { name: 'Record purchase' })).toBeInTheDocument()
})

test('staff can read the history but get no Restock shortcut', async () => {
  fakeApi([...SIGNED_IN, SHOP('staff'), CATS, UNITS, ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, low_stock: true }])),
    ok('GET', '/v1/shops/s1/products/p1', { product: RICE, movements: [] })])
  renderApp('/products')
  await screen.findByRole('button', { name: 'Basmati Rice' })
  expect(screen.queryByRole('button', { name: /^Restock/ })).not.toBeInTheDocument()
})

test('adjusting stock shows what is on the shelf now and after, and takes nothing below zero', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST }])),
    ok('GET', '/v1/shops/s1/products/p1', { product: { ...RICE, ...COST }, movements: [] })])
  renderApp('/products')
  await userEvent.click(await screen.findByRole('button', { name: 'Basmati Rice' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Adjust stock' }))
  const dialog = screen.getByRole('dialog')
  await userEvent.selectOptions(within(dialog).getByLabelText('What happened'), 'add')
  await userEvent.type(within(dialog).getByLabelText('Quantity'), '12.5')
  expect(within(dialog).getByRole('status')).toHaveTextContent('50 now, 62.5 after this comes in')
})

// ── reprint prompts after a price change ──

test('after a price is changed in a row, the label can be reprinted from there', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText: () => ({ width: 10 }) } as unknown as CanvasRenderingContext2D)
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST }])), PATCHED,
    ok('POST', '/v1/shops/s1/products/label-data', [{ uuid: 'p1', name: 'Basmati Rice', product_code: 'R1', barcode: '8901', selling_price: '30' }])])
  renderApp('/products')
  expect(screen.queryByRole('button', { name: /Reprint the label/ })).not.toBeInTheDocument()
  await userEvent.click(await screen.findByRole('button', { name: 'Edit Basmati Rice' }))
  const price = screen.getByRole('textbox', { name: 'Price of Basmati Rice' })
  await userEvent.clear(price)
  await userEvent.type(price, '30{Enter}')
  await userEvent.keyboard('{Enter}')
  const reprint = await screen.findByRole('button', { name: /Reprint the label for Basmati Rice/ })
  await userEvent.click(reprint)
  await screen.findByLabelText('Label preview')
  expect(calls.find(c => c.path.endsWith('/label-data'))?.body).toEqual({ scope: { ids: ['p1'] } })
})

test('a name-only change does not offer a reprint, because nothing printed changed', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST }])), PATCHED])
  renderApp('/products')
  await userEvent.click(await screen.findByRole('button', { name: 'Edit Basmati Rice' }))
  const reorder = screen.getByRole('textbox', { name: 'Reorder level of Basmati Rice' })
  await userEvent.clear(reorder)
  await userEvent.type(reorder, '12{Enter}')
  await waitFor(() => expect(patches(calls)).toHaveLength(1))
  await screen.findByText('Saved')
  expect(screen.queryByRole('button', { name: /Reprint the label/ })).not.toBeInTheDocument()
})

test('after a bulk price change, new labels are offered for the same selection', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText: () => ({ width: 10 }) } as unknown as CanvasRenderingContext2D)
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), CATS, UNITS, ok('GET', /^\/v1\/shops\/s1\/products\?/, page([{ ...RICE, ...COST }])),
    ok('POST', '/v1/shops/s1/products/label-data', [{ uuid: 'p1', name: 'Basmati Rice', product_code: 'R1', barcode: '8901', selling_price: '28.05' }])])
  const base = globalThis.fetch
  vi.stubGlobal('fetch', (path: string, init: RequestInit) => path.endsWith('/products/bulk')
    ? Promise.resolve(new Response(JSON.stringify(JSON.parse(String(init.body)).dry_run ? REVIEW : { ...REVIEW, applied: true }), { status: 200 }))
    : base(path, init))
  renderApp('/products')
  await userEvent.click(await screen.findByLabelText('Select Basmati Rice'))
  await userEvent.click(screen.getByRole('button', { name: 'Change prices' }))
  const dialog = screen.getByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText('Change by (%)'), '10')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Review change' }))
  // The offer comes only once the prices have actually changed, not at the review.
  await within(dialog).findByRole('group', { name: 'Summary' })
  expect(within(dialog).queryByText(/Labels printed earlier/)).not.toBeInTheDocument()
  await userEvent.click(await within(dialog).findByRole('button', { name: 'Change prices of 1 product' }))
  expect(await within(dialog).findByText(/Labels printed earlier still show the old prices/)).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Print new labels' }))
  await screen.findByLabelText('Label preview')
  expect(calls.find(c => c.path.endsWith('/label-data'))?.body).toEqual({ scope: { ids: ['p1'] } })
})

// ── importing: problems, repeats ──

const REPORT = { dry_run: true, rows_read: 4, added: 1, updated: 1, skipped: 2, possible_duplicate: false, previous_import_at: null, errors: [{ row: 4, message: 'Name is required.' }, { row: 5, message: 'GST 7% is not a standard rate.' }], more_errors: 0 }
async function importReply(report: object, real: (path: string) => Response = () => new Response(JSON.stringify({ ...REPORT, dry_run: false, skipped: 0, errors: [] }), { status: 200 })) {
  setup('owner', [{ ...RICE, ...COST }])
  const base = globalThis.fetch
  const sent: string[] = []
  vi.stubGlobal('fetch', (path: string, init: RequestInit) => {
    if (!path.includes('/products/import?')) return base(path, init)
    sent.push(path)
    return Promise.resolve(path.includes('dry_run=true') ? new Response(JSON.stringify(report), { status: 200 }) : real(path))
  })
  renderApp('/products')
  await userEvent.click(await screen.findByRole('button', { name: 'Import' }))
  const dialog = screen.getByRole('dialog')
  await userEvent.upload(within(dialog).getByLabelText('CSV or Excel (.xlsx) file, up to 5 MB'), new File(['product_name,quantity,purchase_price\nTea,1,10'], 'products.csv', { type: 'text/csv' }))
  return { dialog, sent }
}

test('a file with problem rows imports nothing until it is fixed or skipping them is chosen', async () => {
  const { dialog, sent } = await importReply(REPORT)
  const confirm = await within(dialog).findByRole('button', { name: 'Fix the problems first' })
  expect(confirm).toBeDisabled()
  expect(within(dialog).getByText('2 rows have a problem')).toBeInTheDocument()
  expect(within(dialog).getByText('GST 7% is not a standard rate.')).toBeInTheDocument()
  expect(within(dialog).getByText(/Nothing is imported while any row has a problem/)).toBeInTheDocument()
  await userEvent.click(within(dialog).getByLabelText(/Import the 2 good rows and skip the 2 with problems/))
  expect(within(dialog).getByText(/send only the corrected rows/)).toBeInTheDocument()
  await userEvent.click(await within(dialog).findByRole('button', { name: 'Import 2 products and skip 2 rows' }))
  await within(dialog).findByText(/Imported:/)
  const real = sent.find(p => p.includes('dry_run=false'))!
  expect(real).toContain('stop_on_errors=false')
  expect(sent.find(p => p.includes('dry_run=true'))).toContain('stop_on_errors=false')
})

test('without that choice the server is asked to stop on any problem, so nothing partial can slip through', async () => {
  const refuse = () => new Response(JSON.stringify({ error: { code: 'problem_rows', message: '2 rows in the file have problems, so nothing was imported. Fix them and import again.' } }), { status: 422 })
  const { dialog, sent } = await importReply({ ...REPORT, skipped: 0, errors: [] }, refuse)
  await userEvent.click(await within(dialog).findByRole('button', { name: 'Import 2 products' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('nothing was imported')
  expect(sent.find(p => p.includes('dry_run=false'))).toContain('stop_on_errors=true')
})

test('the problem rows can be downloaded, and a long list is shortened on screen', async () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ row: i + 2, message: `Problem ${i + 2}` }))
  const created = vi.fn(() => 'blob:x')
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }))
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const { dialog } = await importReply({ ...REPORT, skipped: 12, errors: many })
  expect(await within(dialog).findByText('Problem 9')).toBeInTheDocument()
  expect(within(dialog).queryByText('Problem 10')).not.toBeInTheDocument()
  expect(within(dialog).getByText('…and 4 more.')).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Download the list of problems (CSV)' }))
  expect(click).toHaveBeenCalledTimes(1)
  const blob = (created.mock.calls[0] as unknown as [Blob])[0]
  expect(await blob.text()).toContain('"11","Problem 11"')
  click.mockRestore()
})

test('a file that was imported before says when, so a repeat is a knowing choice', async () => {
  const { dialog } = await importReply({ ...REPORT, skipped: 0, errors: [], possible_duplicate: true, previous_import_at: '2026-10-05T10:00:00.000Z' })
  expect(await within(dialog).findByText(/already imported on 5 Oct 2026/)).toBeInTheDocument()
  expect(within(dialog).getByText(/adds the stock again/)).toBeInTheDocument()
  expect(within(dialog).getByText(/check the products first/)).toBeInTheDocument()
})
