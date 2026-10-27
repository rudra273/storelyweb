import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { SIGNED_IN, fakeApi, ok, renderApp } from '../test-utils'

afterEach(() => vi.unstubAllGlobals())

const SHOP = (role: string) => ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Asha Stores', role }])

const KPIS = {
  revenue: '205.90', collected: '105.90', invoices: 2, average_order_value: '102.95', discount_rate_percent: '0.00',
  gross_profit: '40.00', gross_margin_percent: '22.22', gst_collected: '25.90', expenses: '820.00',
  unpaid_count: 3, unpaid_total: '160.00', inventory_value: '2360.00', out_of_stock_count: 1, low_stock_count: 2,
  daily: [{ day: '2026-10-01', revenue: '258.40', invoices: 2 }, { day: '2026-10-05', revenue: '-52.50', invoices: 0 }],
  by_payment_method: [{ method: 'upi', total: '53.40' }, { method: 'cash', total: '52.50' }],
  by_category: [{ category: 'Grains', revenue: '52.50' }],
  top_by_revenue: [{ name: 'Mustard Oil', revenue: '153.40', units: '1' }],
  top_by_units: [{ name: 'Basmati Rice', units: '1' }],
}
const REPORT = /^\/v1\/shops\/s1\/reports\/kpis\?/

test('the overview shows the numbers, a chart with a text alternative, and the money methods', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', REPORT, KPIS)])
  renderApp('/reports')
  expect(await screen.findByText('₹205.90')).toBeInTheDocument()
  expect(screen.getByText('2 invoices, net of returns')).toBeInTheDocument()
  expect(screen.getByText('22.22% margin')).toBeInTheDocument()
  expect(screen.getByText(/3 unpaid bills, all time/)).toBeInTheDocument()
  const chart = screen.getByRole('img', { name: /Sales by day: 2026-10-01 ₹258.40, 2026-10-05 -₹52.50/ })
  expect(chart).toBeInTheDocument()
  expect(screen.getByText('upi')).toBeInTheDocument()
  expect(screen.getByText('₹53.40')).toBeInTheDocument()
})

test('changing the period asks the server for exactly those days', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', REPORT, KPIS)])
  renderApp('/reports')
  await screen.findByText('₹205.90')
  await userEvent.selectOptions(screen.getByLabelText('Period'), 'custom')
  // a date picker sets the whole value at once
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-01' } })
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-30' } })
  await waitFor(() => {
    const last = [...calls].reverse().find((c) => c.path.includes('/reports/kpis'))!.path
    const q = new URLSearchParams(last.split('?')[1])
    expect([q.get('from'), q.get('to')]).toEqual(['2026-09-01', '2026-09-30'])
  })
})

test('a backwards custom range is not sent to the server', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', REPORT, KPIS)])
  renderApp('/reports?p=custom&from=2026-10-31&to=2026-10-01')
  expect(await screen.findByText('Pick a start and an end date')).toBeInTheDocument()
  expect(calls.some((c) => c.path.includes('/reports/kpis'))).toBe(false)
})

test('an empty period says so instead of drawing empty charts', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', REPORT, { ...KPIS, revenue: '0.00', invoices: 0, daily: [], by_payment_method: [], by_category: [], top_by_revenue: [], top_by_units: [] })])
  renderApp('/reports')
  expect(await screen.findByText('No sales in this period')).toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

test('a server error is shown in words, not left spinning', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', REPORT, { error: { code: 'internal_error', message: 'Something went wrong.' } }, 500)])
  renderApp('/reports')
  expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.')
})

test('the day book lists the bills and the cash drawer change', async () => {
  fakeApi([
    ...SIGNED_IN, SHOP('admin'),
    ok('GET', /^\/v1\/shops\/s1\/reports\/day-book\?day=2026-10-01/, {
      day: '2026-10-01',
      bills: [{ uuid: 'b1', bill_number: 'INV-1', customer_name: 'Ravi', document_type: 'invoice', total_amount: '105.00', paid_amount: '105.00', balance_due: '0.00', created_at: 'x' },
              { uuid: 'b3', bill_number: 'CN-1', customer_name: 'Ravi', document_type: 'credit_note', total_amount: '-52.50', paid_amount: '0.00', balance_due: '0.00', created_at: 'y' }],
      payments_by_method: [{ method: 'cash', amount: '105.00' }], expenses: [{ uuid: 'e1', category: 'Rent', amount: '500.00', payment_method: 'cash', notes: null }],
      sales: '52.50', collected: '105.00', cash_received: '105.00', cash_expenses: '500.00', total_expenses: '500.00', net_cash: '-395.00',
    }),
  ])
  renderApp('/reports/day-book?day=2026-10-01')
  expect(await screen.findByText('INV-1')).toBeInTheDocument()
  expect(screen.getByText('return')).toBeInTheDocument()
  expect(screen.getByText('-₹395.00')).toBeInTheDocument()
  expect(screen.getByText('Rent')).toBeInTheDocument()
})

test('staff do not get the reports menu entry or the page', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('staff')])
  renderApp('/reports')
  expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument()
  expect(calls.some((c) => c.path.includes('/reports/'))).toBe(false)
  expect(within(screen.getByRole('navigation', { name: 'Main' })).queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument()
})

test('downloading a report asks for the file with the same dates and saves it', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', REPORT, KPIS), ok('GET', /format=csv/, {})])
  const original = globalThis.fetch
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => (path.includes('format=csv') ? new Response('a,b', { status: 200 }) : original(path, init)))
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  renderApp('/reports?p=custom&from=2026-09-01&to=2026-09-30')
  await userEvent.click(await screen.findByRole('button', { name: 'Download CSV' }))
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
  expect(calls.length).toBeGreaterThan(0)
})

test('a report failure offers a retry without losing the selected period', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', REPORT, { error: { code: 'internal_error', message: 'Try again.' } }, 500)])
  renderApp('/reports?p=custom&from=2026-09-01&to=2026-09-30')
  const retry = await screen.findByRole('button', { name: 'Retry report' })
  const before = calls.filter(c => c.path.includes('/reports/kpis')).length
  await userEvent.click(retry)
  await waitFor(() => expect(calls.filter(c => c.path.includes('/reports/kpis')).length).toBeGreaterThan(before))
  expect(screen.getByLabelText('From')).toHaveValue('2026-09-01')
  expect(screen.getByLabelText('To')).toHaveValue('2026-09-30')
  const navigation = screen.getByRole('navigation', { name: 'Reports' })
  expect(within(navigation).getByRole('link', { name: 'Profit and loss' })).toHaveAttribute('href', '/reports/profit-loss?p=custom&from=2026-09-01&to=2026-09-30')
})
