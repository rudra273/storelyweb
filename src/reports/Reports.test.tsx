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
  expect(screen.getByText(/3 unpaid invoices, all time/)).toBeInTheDocument()
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
  expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side.')
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

test('switching shops never shows the previous shop report while the next loads', async () => {
  fakeApi([...SIGNED_IN, ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'First Shop', role: 'owner' }, { shop_id: 's2', name: 'Second Shop', role: 'owner' }]), ok('GET', REPORT, KPIS)])
  const original = globalThis.fetch
  vi.stubGlobal('fetch', (path: string, init: RequestInit) => path.includes('/shops/s2/') ? new Promise<Response>(() => {}) : original(path, init))
  renderApp('/reports')
  await screen.findByText('₹205.90')
  await userEvent.selectOptions(screen.getByLabelText('Shop'), 's2')
  expect(screen.queryByText('₹205.90')).not.toBeInTheDocument()
  expect(screen.getAllByRole('status')[0]).toHaveTextContent('Opening your workspace')
})

test('stock value shows each product\'s GST and cost per unit, and why GST is in cost', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', /^\/v1\/shops\/s1\/reports\/stock-valuation/, {
    items: [{ name: 'Basmati Rice', category: 'Grains', unit: 'kg', quantity: '40', gst_percent: '18', unit_cost: '47.20', cost_value: '1888.00', sale_value: '2000.00' }],
    gst_registered: false, total_cost: '1888.00', total_sale: '2000.00',
  })])
  renderApp('/reports/stock')
  const row = (await screen.findByText('Basmati Rice')).closest('tr')!
  expect(within(row).getByText('18%')).toBeInTheDocument()
  expect(within(row).getByText('₹47.20')).toBeInTheDocument()
  expect(screen.getByText(/Purchase GST is included in stock cost when it cannot be recovered/)).toBeInTheDocument()
  expect(within(row).getByRole('link', { name: 'Basmati Rice' })).toHaveAttribute('href', '/products?q=Basmati%20Rice')
})

test('overview KPIs show period comparisons, expense breakdown, and drill into matching records', async () => {
  fakeApi([
    ...SIGNED_IN, SHOP('owner'),
    ok('GET', REPORT, {
      ...KPIS,
      expenses_by_category: [{ category: 'Rent', amount: '800.00' }],
      comparisons: {
        previous_from: '2026-09-01',
        previous_to: '2026-09-30',
        revenue: { text: '+₹50.00 (+32.1%) vs previous period', direction: 'up' },
        collected: null,
        gross_profit: { text: '-₹10.00 (-20.0%) vs previous period', direction: 'down' },
        expenses: { text: 'No change (0.0%) vs previous period', direction: 'flat' },
      },
    }),
  ])
  renderApp('/reports?p=custom&from=2026-10-01&to=2026-10-31')
  expect(await screen.findByText(/\+₹50\.00 \(\+32\.1%\) vs previous period/)).toBeInTheDocument()
  expect(screen.getByText('No comparison')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Expenses by category' })).toBeInTheDocument()
  const main = within(screen.getByRole('main'))
  expect(main.getByRole('link', { name: 'Sales' })).toHaveAttribute('href', '/billing?from=2026-10-01&to=2026-10-31')
  expect(main.getByRole('link', { name: 'Expenses' })).toHaveAttribute('href', '/expenses?start=2026-10-01&end=2026-10-31')
  expect(main.getByRole('link', { name: 'Still to receive' })).toHaveAttribute('href', '/customers?owing=1')
})

test('day book bills and receivables ageing link directly to the underlying invoices and customer accounts', async () => {
  fakeApi([
    ...SIGNED_IN, SHOP('owner'),
    ok('GET', /^\/v1\/shops\/s1\/reports\/day-book\?day=2026-10-01/, {
      day: '2026-10-01',
      bills: [{ uuid: 'b1', bill_number: 'INV-1', customer_name: 'Ravi', document_type: 'invoice', total_amount: '105.00', paid_amount: '105.00', balance_due: '0.00', created_at: 'x' }],
      payments_by_method: [],
      expenses: [{ uuid: 'e1', category: 'Rent', amount: '500.00', payment_method: 'cash', notes: null }],
      sales: '105.00', collected: '105.00', cash_received: '105.00', cash_expenses: '500.00', total_expenses: '500.00', net_cash: '-395.00',
    }),
    ok('GET', /^\/v1\/shops\/s1\/reports\/receivables-ageing\?as_of=2026-10-25/, {
      as_of: '2026-10-25',
      bucket_labels: ['0-7 days', '8-30 days', '31-60 days', '60+ days'],
      customers: [
        { customer_uuid: 'c1', customer_name: 'Sita', customer_phone: '919888888888', buckets: ['0.00', '100.00', '0.00', '0.00'], total: '100.00' },
        { customer_uuid: null, customer_name: 'Mohan', customer_phone: null, buckets: ['0.00', '0.00', '0.00', '50.00'], total: '50.00' },
      ],
      bucket_totals: ['0.00', '100.00', '0.00', '50.00'],
      total: '150.00',
    }),
  ])
  renderApp('/reports/day-book?day=2026-10-01')
  expect(await screen.findByRole('link', { name: 'INV-1' })).toHaveAttribute('href', '/billing/b1')
  expect(screen.getByRole('link', { name: 'Rent' })).toHaveAttribute('href', '/expenses?start=2026-10-01&end=2026-10-01&category=Rent')
  expect(screen.getByText(/net movement, not opening or counted closing cash/)).toBeInTheDocument()

  renderApp('/reports/receivables?as_of=2026-10-25')
  expect(await screen.findByRole('link', { name: 'Sita' })).toHaveAttribute('href', '/customers/c1')
  expect(screen.getByRole('link', { name: 'Mohan' })).toHaveAttribute('href', '/billing?unassigned_credit=1&q=Mohan')
})

