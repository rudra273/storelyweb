import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { SIGNED_IN, fakeApi, ok, renderApp } from '../../test-utils'

afterEach(() => vi.unstubAllGlobals())
const shop = (role: string) => ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Asha Stores', role }])
const activePath = '/v1/shops/s1/bills?kind=invoice&cancelled=false&limit=1'
const cancelledPath = '/v1/shops/s1/bills?kind=invoice&cancelled=true&limit=1'
const page = (items: object[]) => ({ items, total: items.length, next_cursor: null })
const noInvoices = [ok('GET', activePath, page([])), ok('GET', cancelledPath, page([]))]
const catalog = (items: object[]) => ok('GET', /^\/v1\/shops\/s1\/products\?/, page(items))

test('owners see server figures for today and links to outstanding work', async () => {
  const calls = fakeApi([...SIGNED_IN, shop('owner'), ok('GET', activePath, page([{ uuid: 'b1', document_type: 'invoice' }])), ok('GET', /^\/v1\/shops\/s1\/reports\/kpis\?/, {
    revenue: '125.50', collected: '100', invoices: 1, unpaid_total: '25.50', unpaid_count: 1,
    inventory_value: '980', low_stock_count: 2, out_of_stock_count: 1,
  })])
  renderApp('/')
  expect(await screen.findByText('₹125.50')).toBeInTheDocument()
  expect(screen.getByText('1 unpaid invoice · all time')).toBeInTheDocument()
  expect(screen.getByText('2 running low · 1 out of stock')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Review stock →' })).toHaveAttribute('href', '/products?low=1')
  const request = calls.find(c => c.path.includes('/reports/kpis'))!
  const params = new URLSearchParams(request.path.split('?')[1])
  expect(params.get('from')).toBe(params.get('to'))
})

test('staff get daily tools without restricted report or setup requests', async () => {
  const calls = fakeApi([...SIGNED_IN, shop('staff')])
  renderApp('/')
  expect(await screen.findByText('Everything you need at the counter.')).toBeInTheDocument()
  for (const link of screen.getAllByRole('link', { name: /New invoice/ })) expect(link).toHaveAttribute('href', '/billing/new')
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Your daily tools' })).toBeInTheDocument())
  expect(calls.some(c => c.path.includes('/reports/') || c.path.includes('/bills?') || c.path.includes('/products?'))).toBe(false)
  expect(screen.queryByText('Today at a glance')).not.toBeInTheDocument()
})

test('a fresh shop offers one first-product action and retains secondary setup links', async () => {
  fakeApi([...SIGNED_IN, shop('owner'), ...noInvoices, catalog([])])
  renderApp('/')
  expect(await screen.findByRole('heading', { name: 'Get your shop ready' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Add your first product' })).toHaveAttribute('href', '/products?new=1')
  expect(screen.queryByRole('link', { name: 'Create your first invoice' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Shop identity/ })).toHaveAttribute('href', '/settings?tab=shop')
  expect(screen.getByText(/actual opening stock/)).toBeInTheDocument()
})

test('catalog products advance guidance to the first invoice rather than completing it', async () => {
  fakeApi([...SIGNED_IN, shop('owner'), ...noInvoices, catalog([{ uuid: 'p1', name: 'Rice' }])])
  renderApp('/')
  expect(await screen.findByRole('link', { name: 'Create your first invoice' })).toHaveAttribute('href', '/billing/new')
  expect(screen.queryByRole('link', { name: 'Add your first product' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Get your shop ready' })).toBeInTheDocument()
})

for (const cancelled of [false, true]) {
  test(`a saved ${cancelled ? 'cancelled' : 'active'} original invoice completes guidance even without catalog products`, async () => {
    const calls = fakeApi([...SIGNED_IN, shop('owner'), ok('GET', activePath, page(cancelled ? [] : [{ uuid: 'b1', document_type: 'invoice' }])), ok('GET', cancelledPath, page([{ uuid: 'b1', document_type: 'invoice', cancelled: true }]))])
    renderApp('/')
    await waitFor(() => expect(calls.some(call => call.path === (cancelled ? cancelledPath : activePath))).toBe(true))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Setup progress' })).not.toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: 'Get your shop ready' })).not.toBeInTheDocument()
    expect(calls.some(call => call.path.includes('/products?'))).toBe(false)
    if (!cancelled) expect(calls.some(call => call.path === cancelledPath)).toBe(false)
  })
}

test('credit notes and local draft data do not complete the sales-invoice milestone', async () => {
  localStorage.setItem('storely.draft.bill.u1.s1', JSON.stringify({ held: [{ id: 'draft', data: {} }], data: { attempt: { key: 'pending-invoice', body: {} } } }))
  fakeApi([...SIGNED_IN, shop('owner'), ok('GET', activePath, page([{ uuid: 'credit', document_type: 'credit_note' }])), ok('GET', cancelledPath, page([])), catalog([{ uuid: 'p1', name: 'Rice' }])])
  renderApp('/')
  expect(await screen.findByRole('link', { name: 'Create your first invoice' })).toBeInTheDocument()
})

test('invoice progress failure offers retry without falsely showing setup completion', async () => {
  const active = ok('GET', activePath, { error: { code: 'unavailable', message: 'Unavailable' } }, 503)
  fakeApi([...SIGNED_IN, shop('owner'), active, ok('GET', cancelledPath, page([])), catalog([])])
  renderApp('/')
  await screen.findByText(/Could not check your first-invoice progress/)
  expect(screen.queryByRole('link', { name: 'Add your first product' })).not.toBeInTheDocument()
  active.body = page([]); active.status = 200
  await userEvent.click(screen.getByRole('button', { name: 'Retry setup progress' }))
  expect(await screen.findByRole('link', { name: 'Add your first product' })).toBeInTheDocument()
})

test('catalog failure keeps a retry action instead of silently dropping first-invoice guidance', async () => {
  const products = ok('GET', /^\/v1\/shops\/s1\/products\?/, { error: { code: 'unavailable', message: 'Unavailable' } }, 503)
  fakeApi([...SIGNED_IN, shop('owner'), ...noInvoices, products])
  renderApp('/')
  await screen.findByText(/Could not check your catalog/)
  products.body = page([{ uuid: 'p1', name: 'Rice' }]); products.status = 200
  await userEvent.click(screen.getByRole('button', { name: 'Retry setup progress' }))
  expect(await screen.findByRole('link', { name: 'Create your first invoice' })).toBeInTheDocument()
})
