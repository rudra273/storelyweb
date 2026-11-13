import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { SIGNED_IN, fakeApi, ok, renderApp } from '../test-utils'

afterEach(() => vi.unstubAllGlobals())

const SHOP = ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Asha Stores', role: 'owner' }])
const page = { items: [], has_more: false, count: 0, total: '0.00', cash_total: '0.00', by_category: [], categories: ['Rent', 'Other'] }
const list = ok('GET', /^\/v1\/shops\/s1\/expenses\?/, page)

const customerPath = '/v1/shops/s1/customers/c1'
const customerDetail = {
  customer: { uuid: 'c1', name: 'Ravi', due: '205.00', due_bills: 2, total_purchase_amount: '210.00', bill_count: 2 },
  bills: [],
  payments: [],
}

test('reviewing a customer payment shows its allocation and confirmation sends the review key', async () => {
  const review = {
    due_before: '205.00', due_after: '55.00', review_key: 'reviewed',
    allocations: [
      { bill_uuid: 'b1', bill_number: 'INV/1', amount: '100.00', due_after: '0.00' },
      { bill_uuid: 'b2', bill_number: 'INV/2', amount: '50.00', due_after: '55.00' },
    ],
  }
  const calls = fakeApi([
    ...SIGNED_IN, SHOP, ok('GET', customerPath, customerDetail),
    ok('POST', `${customerPath}/payments/preview`, review),
    ok('POST', `${customerPath}/payments`, customerDetail),
  ])
  renderApp('/customers/c1')
  await userEvent.click(await screen.findByRole('button', { name: 'Record payment' }))
  const dialog = within(screen.getByRole('dialog'))
  const amount = dialog.getByLabelText(/Amount received/)
  await userEvent.clear(amount)
  await userEvent.type(amount, '150')
  await userEvent.click(dialog.getByRole('button', { name: 'Review payment' }))
  expect(await dialog.findByRole('row', { name: /INV\/1.*₹100\.00.*₹0\.00/ })).toBeInTheDocument()
  expect(calls.some(c => c.path === `${customerPath}/payments`)).toBe(false)
  await userEvent.click(dialog.getByRole('button', { name: 'Confirm payment' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  const save = calls.find(c => c.path === `${customerPath}/payments`)
  expect(save?.body).toMatchObject({ amount: '150', review_key: 'reviewed' })
  expect(save?.headers.get('Idempotency-Key')).toBeTruthy()
})

test('unassigned balances on Customers open the matching invoice list', async () => {
  const calls = fakeApi([
    ...SIGNED_IN, SHOP,
    ok('GET', /^\/v1\/shops\/s1\/customers\/accounts\?/, {
      items: [], has_more: false, owing_customers: 0, total_due: '0.00',
      unassigned_due: '205.00', unassigned_bills: 2,
    }),
    ok('GET', /^\/v1\/shops\/s1\/bills\?/, { items: [], total: 0, next_cursor: null }),
  ])
  renderApp('/customers')
  expect(await screen.findByText('₹205.00')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: 'View 2 invoices' }))
  expect(await screen.findByRole('checkbox', { name: 'Unassigned balances' })).toBeChecked()
  await waitFor(() => expect(calls.some(c => c.path.includes('unassigned_credit=true'))).toBe(true))
})

test('creating a customer keeps the same Idempotency-Key on retry after failure', async () => {
  const calls = fakeApi([
    ...SIGNED_IN, SHOP,
    ok('GET', /^\/v1\/shops\/s1\/customers\/accounts\?/, {
      items: [], has_more: false, owing_customers: 0, total_due: '0.00',
      unassigned_due: '0.00', unassigned_bills: 0,
    }),
    ok('POST', '/v1/shops/s1/customers', { error: { code: 'internal_error', message: 'Temporary failure' } }, 500),
  ])
  renderApp('/customers')
  await userEvent.click(await screen.findByRole('button', { name: 'Add customer' }))
  const dialog = within(screen.getByRole('dialog'))
  await userEvent.type(dialog.getByLabelText(/Name/), 'Ravi')
  await userEvent.type(dialog.getByLabelText(/Phone/), '9876543210')
  await userEvent.click(dialog.getByRole('button', { name: 'Add customer' }))
  expect(await dialog.findByRole('alert')).toHaveTextContent('Temporary failure')
  await userEvent.click(dialog.getByRole('button', { name: 'Add customer' }))
  await waitFor(() => expect(calls.filter(c => c.method === 'POST' && c.path === '/v1/shops/s1/customers')).toHaveLength(2))
  const posts = calls.filter(c => c.method === 'POST' && c.path === '/v1/shops/s1/customers')
  expect(posts[0]!.headers.get('Idempotency-Key')).toBeTruthy()
  expect(posts[0]!.headers.get('Idempotency-Key')).toBe(posts[1]!.headers.get('Idempotency-Key'))
})

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

test('a form with unsaved changes asks before closing, a clean one does not', async () => {
  fakeApi([...SIGNED_IN, SHOP, list])
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  renderApp('/expenses')
  await userEvent.click(await screen.findByRole('button', { name: 'Add expense' }))
  let dialog = screen.getByRole('dialog')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(confirm).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

  await userEvent.click(screen.getByRole('button', { name: 'Add expense' }))
  dialog = screen.getByRole('dialog')
  await userEvent.type(within(dialog).getByLabelText(/Amount/), '75')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(confirm).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(within(screen.getByRole('dialog')).getByLabelText(/Amount/)).toHaveValue('75')

  confirm.mockReturnValue(true)
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  confirm.mockRestore()
})

test('switching shop with an unsaved form asks first and keeps the form if declined', async () => {
  fakeApi([...SIGNED_IN, ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Asha Stores', role: 'owner' }, { shop_id: 's2', name: 'Asha Stores', role: 'owner' }]), list, ok('GET', /^\/v1\/shops\/s2\/expenses\?/, page), ok('GET', /^\/v1\/shops\/s2\/entitlement$/, { shop_id: 's2', plan: 'premium', status: 'active', effective_status: 'active' })])
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  renderApp('/expenses')
  await userEvent.click(await screen.findByRole('button', { name: 'Add expense' }))
  await userEvent.type(within(screen.getByRole('dialog')).getByLabelText(/Amount/), '75')
  const shopSelect = screen.getByLabelText('Shop', { selector: 'select' })
  await userEvent.selectOptions(shopSelect, 's2')
  expect(confirm).toHaveBeenCalledTimes(1)
  expect(shopSelect).toHaveValue('s1')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  confirm.mockRestore()
})

test('customer and expense filters stay in the address so Back returns to the same view', async () => {
  const calls = fakeApi([
    ...SIGNED_IN, SHOP,
    ok('GET', /^\/v1\/shops\/s1\/customers\/accounts\?/, {
      items: [{ uuid: 'c1', name: 'Ravi', phone: '919876543210', due: '205.00', due_bills: 2, total_purchase_amount: '210.00', bill_count: 2, last_purchase_at: '2026-11-01' }],
      has_more: false, owing_customers: 1, total_due: '205.00', unassigned_due: '0.00', unassigned_bills: 0,
    }),
    ok('GET', customerPath, customerDetail),
    ok('GET', /^\/v1\/shops\/s1\/expenses\?/, page),
  ])
  renderApp('/customers?owing=1&q=Ravi')
  expect(await screen.findByRole('checkbox', { name: 'Only customers who owe' })).toBeChecked()
  expect(screen.getByLabelText('Search')).toHaveValue('Ravi')
  await userEvent.click(await screen.findByRole('link', { name: 'Ravi' }))
  expect(await screen.findByRole('heading', { name: 'Ravi' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to customers' })).toHaveAttribute('href', '/customers?owing=1&q=Ravi')

  renderApp('/expenses?start=2026-10-01&end=2026-10-15&category=Rent&q=office')
  expect(await screen.findByLabelText('Search')).toHaveValue('office')
  await waitFor(() => expect(calls.some(c => c.path.includes('/expenses?start=2026-10-01&end=2026-10-15&category=Rent&q=office'))).toBe(true))
})
