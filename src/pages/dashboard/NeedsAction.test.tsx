import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { SIGNED_IN, fakeApi, ok, renderApp } from '../../test-utils'
const ageing = { as_of: '2026-11-22', bucket_labels: ['0–7', '8–30', '31–60', '61+'], customers: [{ customer_uuid: 'c1', customer_name: 'Older Ravi', customer_phone: '9876543210', buckets: ['100', '20', '0.10', '0.20'], total: '120.30' }, { customer_uuid: 'c2', customer_name: 'Recent Ravi', buckets: ['50', '0', '0', '0'], total: '50' }], bucket_totals: ['150', '20', '0.10', '0.20'], total: '170.30' }
const overdue = /^\/v1\/shops\/s1\/reports\/receivables-ageing\?/
const expiry = '/v1/shops/s1/reports/expiring-stock?days=7'
const owner = ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Shop', role: 'owner' }])
const expired = { as_of: '2026-11-22', days: 7, batches: [{ product_uuid: 'p1', product_name: 'Rice', quantity: '2', expiry: '2026-11-20', expired: true }, { product_uuid: 'p1', product_name: 'Rice', quantity: '3', expiry: '2026-11-24', expired: false }] }
afterEach(() => vi.unstubAllGlobals())

test('existing business alerts route to exact overdue and seven-day expiry report views', async () => {
  fakeApi([...SIGNED_IN, owner, ok('GET', overdue, ageing), ok('GET', expiry, expired)])
  renderApp('/')
  const region = await screen.findByRole('region', { name: 'Needs action' })
  const link = await within(region).findByRole('link', { name: '1 customer owes for over 30 days · ₹0.30' })
  expect(link.getAttribute('href')).toMatch(/^\/reports\/receivables\?overdue=1&as_of=\d{4}-\d{2}-\d{2}$/)
  expect(await within(region).findByRole('link', { name: '1 batch expired' })).toHaveAttribute('href', '/reports/expiring?days=7')
})

test('partial alert outage keeps other alerts and offers an independent retry', async () => {
  const failed = ok('GET', overdue, { error: { code: 'unavailable', message: 'Unavailable' } }, 503)
  const calls = fakeApi([...SIGNED_IN, owner, failed, ok('GET', expiry, expired)])
  renderApp('/')
  const region = await screen.findByRole('region', { name: 'Needs action' })
  expect(await within(region).findByRole('link', { name: '1 batch expired' })).toBeInTheDocument()
  expect(await within(region).findByRole('button', { name: 'Retry overdue alerts' })).toBeInTheDocument()
  expect(within(region).queryByText(/All caught up/)).not.toBeInTheDocument()
  failed.status = 200; failed.body = ageing
  await userEvent.click(within(region).getByRole('button', { name: 'Retry overdue alerts' }))
  expect(await within(region).findByRole('link', { name: /over 30 days/ })).toBeInTheDocument()
  expect(calls.filter(call => call.path === expiry)).toHaveLength(1)
})

test('all caught up requires both successful empty reports; staff never requests report alerts', async () => {
  fakeApi([...SIGNED_IN, owner, ok('GET', overdue, { ...ageing, customers: [] }), ok('GET', expiry, { ...expired, batches: [] })])
  const first = renderApp('/')
  expect(await screen.findByText(/All caught up/)).toBeInTheDocument()
  first.unmount()
  const calls = fakeApi([...SIGNED_IN, ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Shop', role: 'staff' }])])
  renderApp('/')
  await screen.findByText('Everything you need at the counter.')
  expect(screen.queryByRole('region', { name: 'Needs action' })).not.toBeInTheDocument()
  expect(calls.some(call => call.path.includes('/reports/'))).toBe(false)
})

test('overdue destination shows only old balances with matching totals and restores full report on clear', async () => {
  fakeApi([...SIGNED_IN, owner, ok('GET', overdue, ageing)])
  renderApp('/reports/receivables?overdue=1&as_of=2026-11-22')
  expect(await screen.findByRole('link', { name: 'Older Ravi' })).toHaveAttribute('href', '/customers/c1')
  expect(screen.queryByRole('link', { name: 'Recent Ravi' })).not.toBeInTheDocument()
  expect(screen.getByRole('table')).toHaveTextContent('₹0.30')
  expect(screen.queryByText('₹120.30')).not.toBeInTheDocument()
  expect(screen.queryByRole('columnheader', { name: '0–7' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByLabelText('Over 30 days only'))
  expect(await screen.findByRole('link', { name: 'Recent Ravi' })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('columnheader', { name: '0–7' })).toBeInTheDocument())
})
