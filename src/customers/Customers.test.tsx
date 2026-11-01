import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { SIGNED_IN, fakeApi, ok, renderApp } from '../test-utils'

afterEach(() => vi.unstubAllGlobals())

const SHOP = ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Asha Stores', role: 'owner' }])
const page = { items: [], has_more: false, count: 0, total: '0.00', cash_total: '0.00', by_category: [], categories: ['Rent', 'Other'] }
const list = ok('GET', /^\/v1\/shops\/s1\/expenses\?/, page)

test('adding an expense again after a lost response replays the same request', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP, list, ok('POST', '/v1/shops/s1/expenses', { error: { code: 'network', message: 'Connection interrupted' } }, 503)])
  renderApp('/expenses')
  await userEvent.click(await screen.findByRole('button', { name: 'Add expense' }))
  const dialog = screen.getByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText(/Amount/), '75')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Add expense' }))
  await within(dialog).findByRole('alert')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Add expense' }))
  await waitFor(() => expect(calls.filter(c => c.method === 'POST' && c.path === '/v1/shops/s1/expenses')).toHaveLength(2))
  const [first, second] = calls.filter(c => c.method === 'POST' && c.path === '/v1/shops/s1/expenses')
  expect(first!.headers.get('Idempotency-Key')).toBeTruthy()
  expect(first!.headers.get('Idempotency-Key')).toBe(second!.headers.get('Idempotency-Key'))
})

test('changing the details gets a new retry key', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP, list, ok('POST', '/v1/shops/s1/expenses', { error: { code: 'network', message: 'Connection interrupted' } }, 503)])
  renderApp('/expenses')
  await userEvent.click(await screen.findByRole('button', { name: 'Add expense' }))
  const dialog = screen.getByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText(/Amount/), '75')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Add expense' }))
  await within(dialog).findByRole('alert')
  await userEvent.type(within(dialog).getByLabelText(/Amount/), '0')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Add expense' }))
  await waitFor(() => expect(calls.filter(c => c.method === 'POST' && c.path === '/v1/shops/s1/expenses')).toHaveLength(2))
  const [first, second] = calls.filter(c => c.method === 'POST' && c.path === '/v1/shops/s1/expenses')
  expect(first!.headers.get('Idempotency-Key')).not.toBe(second!.headers.get('Idempotency-Key'))
})

test('an expense list that is cut off says so', async () => {
  fakeApi([...SIGNED_IN, SHOP, ok('GET', /^\/v1\/shops\/s1\/expenses\?/, { ...page, items: [{ uuid: 'e1', expense_date: '2026-11-01T09:00:00.000', amount: '10.00', category: 'Rent', payment_method: 'cash', notes: null, created_at: 'x', updated_at: 'x' }], has_more: true, count: 1001, total: '10010.00' })])
  renderApp('/expenses')
  expect(await screen.findByText(/Showing the latest 1 of 1001 expenses/)).toBeInTheDocument()
})
