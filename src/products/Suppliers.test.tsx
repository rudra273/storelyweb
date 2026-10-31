import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { fakeApi, ok, renderApp, SIGNED_IN } from '../test-utils'

afterEach(() => vi.unstubAllGlobals())
const supplier = { uuid: 'vendor1', name: 'Asha Wholesale', phone: '12345', email: null, gstin: null, address: null, notes: null }
function setup(role = 'owner', failure = false) {
  return fakeApi([
    ...SIGNED_IN,
    ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Shop', role }]),
    ok('GET', /\/products\?/, { items: [], total: 0, next_cursor: null }),
    ok('GET', '/v1/shops/s1/categories', []), ok('GET', '/v1/shops/s1/units', []),
    ok('GET', '/v1/shops/s1/suppliers', [supplier]),
    ok('POST', '/v1/shops/s1/suppliers', failure ? { error: { code: 'duplicate', message: 'Supplier already exists.' } } : supplier, failure ? 409 : 201),
    ok('PATCH', '/v1/shops/s1/suppliers/vendor1', supplier),
    ok('POST', '/v1/shops/s1/products', { product: { uuid: 'p1' }, movements: [] }),
    ok('GET', '/v1/shops/s1/products/p1', { product: { uuid: 'p1', name: 'Tea', selling_price: '20', quantity: '0', track_stock: true, updated_at: '2026-10-29' }, movements: [] }),
  ])
}

test('create supplier inline retains product draft and selects saved supplier', async () => {
  const calls = setup()
  renderApp('/products')
  await userEvent.click(await screen.findByRole('button', { name: 'Add product' }))
  await userEvent.type(screen.getByLabelText('Product name'), 'Tea')
  await userEvent.type(screen.getByLabelText('Selling price (₹)'), '20')
  await userEvent.click(screen.getByRole('button', { name: '+ New supplier' }))
  await userEvent.type(screen.getByLabelText('Supplier name'), '  Asha Wholesale  ')
  await userEvent.click(screen.getByRole('button', { name: 'Save supplier' }))
  await waitFor(() => expect(screen.queryByLabelText('Supplier name')).not.toBeInTheDocument())
  expect(screen.getByLabelText('Product name')).toHaveValue('Tea')
  expect(screen.getByLabelText('Preferred supplier (optional)')).toHaveValue('vendor1')
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add product' }))
  await waitFor(() => expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/products'))?.body).toMatchObject({ name: 'Tea', supplier_uuid: 'vendor1', selling_price: '20' }))
  expect(calls.filter(c => c.method === 'POST' && c.path.endsWith('/suppliers'))).toHaveLength(1)
})

test('supplier directory searches and saves profile edits', async () => {
  const calls = setup()
  renderApp('/products')
  await userEvent.click(await screen.findByText('More actions'))
  await userEvent.click(screen.getByRole('button', { name: 'Suppliers' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Edit Asha Wholesale' }))
  await userEvent.clear(screen.getByLabelText('Phone'))
  await userEvent.type(screen.getByLabelText('Phone'), '99999')
  await userEvent.click(screen.getByRole('button', { name: 'Save supplier' }))
  await waitFor(() => expect(calls.find(c => c.method === 'PATCH')?.body).toMatchObject({ phone: '99999' }))
  await userEvent.type(screen.getByLabelText('Search suppliers'), 'missing')
  expect(screen.getByText('No suppliers match.')).toBeInTheDocument()
})

test('supplier save failure retains entered name and product draft', async () => {
  setup('owner', true)
  renderApp('/products')
  await userEvent.click(await screen.findByRole('button', { name: 'Add product' }))
  await userEvent.type(screen.getByLabelText('Product name'), 'Tea')
  await userEvent.click(screen.getByRole('button', { name: '+ New supplier' }))
  await userEvent.type(screen.getByLabelText('Supplier name'), 'Asha')
  await userEvent.click(screen.getByRole('button', { name: 'Save supplier' }))
  expect(await screen.findByText('Supplier already exists.')).toBeInTheDocument()
  expect(screen.getByLabelText('Supplier name')).toHaveValue('Asha')
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Add supplier' })).getByRole('button', { name: 'Cancel' }))
  expect(screen.getByLabelText('Product name')).toHaveValue('Tea')
})

test('staff cannot manage suppliers and do not request supplier data', async () => {
  const calls = setup('staff')
  renderApp('/products')
  await screen.findByText('Ask the owner to add products.')
  expect(screen.queryByRole('button', { name: 'Suppliers' })).not.toBeInTheDocument()
  expect(calls.some(c => c.path.endsWith('/suppliers'))).toBe(false)
})
