import { screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { SIGNED_IN, fakeApi, ok, renderApp } from '../../test-utils'

afterEach(() => vi.unstubAllGlobals())
const shop = (role: string) => ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Asha Stores', role }])

test('owners see server figures for today and links to outstanding work', async () => {
  const calls = fakeApi([...SIGNED_IN, shop('owner'), ok('GET', /^\/v1\/shops\/s1\/reports\/kpis\?/, {
    revenue: '125.50', collected: '100', invoices: 1, unpaid_total: '25.50', unpaid_count: 1,
    inventory_value: '980', low_stock_count: 2, out_of_stock_count: 1,
  })])
  renderApp('/')
  expect(await screen.findByText('₹125.50')).toBeInTheDocument()
  expect(screen.getByText('1 unpaid bill · all time')).toBeInTheDocument()
  expect(screen.getByText('2 running low · 1 out of stock')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Review stock →' })).toHaveAttribute('href', '/products?low=1')
  const request = calls.find(c => c.path.includes('/reports/kpis'))!
  const params = new URLSearchParams(request.path.split('?')[1])
  expect(params.get('from')).toBe(params.get('to'))
})

test('staff get daily tools without requesting restricted report data', async () => {
  const calls = fakeApi([...SIGNED_IN, shop('staff')])
  renderApp('/')
  expect(await screen.findByText('Everything you need at the counter.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Create bill/ })).toHaveAttribute('href', '/billing/new')
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Your daily tools' })).toBeInTheDocument())
  expect(calls.some(c => c.path.includes('/reports/'))).toBe(false)
  expect(screen.queryByText('Today at a glance')).not.toBeInTheDocument()
})

test('a new shop with no products gets three steps to get started', async () => {
  fakeApi([...SIGNED_IN, shop('owner'), ok('GET', /^\/v1\/shops\/s1\/products\?/, { items: [], total: 0, next_cursor: null })])
  renderApp('/')
  expect(await screen.findByRole('heading', { name: 'Get your shop ready' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Add your first product/ })).toHaveAttribute('href', '/products?new=1')
  expect(screen.getByRole('link', { name: /Check your shop details/ })).toHaveAttribute('href', '/settings')
})

test('a shop that has products does not see the get-started steps', async () => {
  fakeApi([...SIGNED_IN, shop('owner'), ok('GET', /^\/v1\/shops\/s1\/products\?/, { items: [{ uuid: 'p1', name: 'Rice' }], total: 1, next_cursor: null })])
  renderApp('/')
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Your daily tools' })).toBeInTheDocument())
  expect(screen.queryByRole('heading', { name: 'Get your shop ready' })).not.toBeInTheDocument()
})
