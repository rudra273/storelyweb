import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { fakeApi, ok, renderApp, SIGNED_IN } from '../../test-utils'

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })
const supplier = { uuid: 'vendor1', name: 'Asha Wholesale', phone: '12345', email: null, gstin: null, address: null, notes: null, balance_due: '100.00', overdue_due: '60.00' }
const STATEMENT = {
  balance_due: '100.00', overdue: '60.00', purchased_total: '250.00', paid_total: '150.00', unrecorded_purchases: 1,
  purchases: [
    { uuid: 'r1', purchase_date: '2026-09-01', invoice_number: 'A-1', payment_status: 'partial', total: '160.00', due_date: '2020-01-01', paid_amount: '100.00', balance_due: '60.00' },
    { uuid: 'r2', purchase_date: '2026-09-10', invoice_number: 'A-2', payment_status: 'unpaid', total: '90.00', due_date: null, paid_amount: '50.00', balance_due: '40.00' },
    { uuid: 'r3', purchase_date: '2026-09-12', invoice_number: null, payment_status: 'not_recorded', total: null, due_date: null, paid_amount: '0', balance_due: null },
  ],
  payments: [
    { uuid: 'pay1', payment_date: '2026-09-20', amount: '150.00', payment_method: 'upi', reference: 'UTR9', notes: null, allocations: [{ purchase_uuid: 'r1', invoice_number: 'A-1', purchase_date: '2026-09-01', amount: '100.00' }, { purchase_uuid: 'r2', invoice_number: 'A-2', purchase_date: '2026-09-10', amount: '50.00' }] },
  ],
  ledger: [
    { kind: 'purchase', uuid: 'r1', date: '2026-09-01', reference: 'A-1', method: null, debit: '160.00', credit: '0', balance: '160.00' },
    { kind: 'purchase', uuid: 'r2', date: '2026-09-10', reference: 'A-2', method: null, debit: '90.00', credit: '0', balance: '250.00' },
    { kind: 'payment', uuid: 'pay1', date: '2026-09-20', reference: 'UTR9', method: 'upi', debit: '0', credit: '150.00', balance: '100.00' },
  ],
}
const SUMMARY = { purchases: 3, purchase_value: '250.00', payments_made: '150.00', unrecorded_purchases: 1, unrecorded_stock_cost: '40.00', payable: '100.00', overdue: '60.00', overdue_purchases: 1, suppliers_owed: 1 }
function setup(role = 'owner', failure = false, paymentFailure = false) {
  return fakeApi([
    ...SIGNED_IN,
    ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Shop', role }]),
    ok('GET', /\/products\?/, { items: [], total: 0, next_cursor: null }),
    ok('GET', '/v1/shops/s1/categories', []), ok('GET', '/v1/shops/s1/units', []),
    ok('GET', '/v1/shops/s1/suppliers', [supplier]),
    ok('POST', '/v1/shops/s1/suppliers', failure ? { error: { code: 'duplicate', message: 'Supplier already exists.' } } : supplier, failure ? 409 : 201),
    ok('PATCH', '/v1/shops/s1/suppliers/vendor1', supplier),
    ok('GET', '/v1/shops/s1/suppliers/vendor1/statement', STATEMENT),
    ok('GET', /\/purchase-receipts\/summary/, SUMMARY),
    ok('POST', '/v1/shops/s1/suppliers/vendor1/payments', paymentFailure ? { error: { code: 'unavailable', message: 'Response interrupted.' } } : { uuid: 'payment1' }, paymentFailure ? 500 : 201),
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
  await userEvent.click(screen.getByRole('button', { name: 'Add supplier' }))
  await waitFor(() => expect(screen.queryByLabelText('Supplier name')).not.toBeInTheDocument())
  expect(screen.getByLabelText('Product name')).toHaveValue('Tea')
  expect(screen.getByLabelText('Preferred supplier (optional)')).toHaveValue('vendor1')
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add product' }))
  await waitFor(() => expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/products'))?.body).toMatchObject({ name: 'Tea', supplier_uuid: 'vendor1', selling_price: '20' }))
  expect(calls.filter(c => c.method === 'POST' && c.path.endsWith('/suppliers'))).toHaveLength(1)
})

test('supplier directory searches and saves profile edits', async () => {
  const calls = setup()
  renderApp('/suppliers')
  await userEvent.click(await screen.findByRole('button', { name: 'Edit Asha Wholesale' }))
  await userEvent.clear(screen.getByLabelText('Phone'))
  await userEvent.type(screen.getByLabelText('Phone'), '99999')
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(calls.find(c => c.method === 'PATCH')?.body).toMatchObject({ phone: '99999' }))
  await userEvent.type(screen.getByLabelText('Search suppliers'), 'missing')
  expect(screen.getByText('No suppliers match')).toBeInTheDocument()
})

test('supplier save failure retains entered name and product draft', async () => {
  setup('owner', true)
  renderApp('/products')
  await userEvent.click(await screen.findByRole('button', { name: 'Add product' }))
  await userEvent.type(screen.getByLabelText('Product name'), 'Tea')
  await userEvent.click(screen.getByRole('button', { name: '+ New supplier' }))
  await userEvent.type(screen.getByLabelText('Supplier name'), 'Asha')
  await userEvent.click(screen.getByRole('button', { name: 'Add supplier' }))
  expect(await screen.findByText('Supplier already exists.')).toBeInTheDocument()
  expect(screen.getByLabelText('Supplier name')).toHaveValue('Asha')
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Add supplier' })).getByRole('button', { name: 'Cancel' }))
  expect(screen.getByLabelText('Product name')).toHaveValue('Tea')
})

test('staff cannot manage suppliers and do not request supplier data', async () => {
  const calls = setup('staff')
  renderApp('/products')
  await screen.findByText('Ask the owner to add products.')
  expect(screen.queryByRole('link', { name: 'Suppliers' })).not.toBeInTheDocument()
  expect(calls.some(c => c.path.endsWith('/suppliers'))).toBe(false)
})

async function openAccount() {
  await userEvent.click(await screen.findByRole('link', { name: 'Account of Asha Wholesale' }))
  await screen.findByRole('heading', { name: 'Asha Wholesale' })
}

test('the directory shows what is owed and overdue, and each supplier opens its own account', async () => {
  setup(); renderApp('/suppliers')
  const owe = (await screen.findByText('You owe suppliers')).closest('.kpi') as HTMLElement
  expect(within(owe).getByText('₹100.00')).toBeInTheDocument()
  const row = (await screen.findByRole('link', { name: 'Asha Wholesale' })).closest('tr') as HTMLElement
  expect(within(row).getByText('₹60.00')).toBeInTheDocument()
  expect(within(row).getByText('₹100.00')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Asha Wholesale' })).toHaveAttribute('href', '/suppliers/vendor1')
  await openAccount()
  expect(screen.getByRole('link', { name: '← Suppliers' })).toHaveAttribute('href', '/suppliers')
})

test('the account lists purchases, where each payment went, and a statement that ends at the balance owed', async () => {
  setup(); renderApp('/suppliers/vendor1')
  await screen.findByRole('heading', { name: 'Asha Wholesale' })
  const kpi = (label: string) => within(screen.getByText(label, { selector: '.kpi-label' }).closest('.kpi') as HTMLElement)
  expect(await kpi('You owe').findByText('₹100.00')).toBeInTheDocument()
  expect(kpi('Overdue').getByText('₹60.00')).toBeInTheDocument()
  expect(kpi('Purchased').getByText('₹250.00')).toBeInTheDocument()
  expect(kpi('Paid').getByText('₹150.00')).toBeInTheDocument()
  expect(screen.getByText(/1 purchase has no payment terms recorded/)).toBeInTheDocument()
  const purchases = within(screen.getByRole('region', { name: 'Purchases' }))
  expect(purchases.getByText('Overdue', { selector: '.payment-badge' })).toBeInTheDocument()
  expect(purchases.getByText('Not recorded', { selector: 'span.muted' })).toBeInTheDocument()
  const payments = within(screen.getByRole('region', { name: 'Payments' }))
  expect(payments.getByRole('link', { name: 'A-1' })).toHaveAttribute('href', '/purchases/r1')
  const statement = within(screen.getByRole('region', { name: 'Statement' }))
  const rows = statement.getAllByRole('row').map(r => r.textContent)
  expect(rows.at(-1)).toContain('Balance owed')
  expect(rows.at(-1)).toContain('₹100.00')
  expect(rows.at(-2)).toContain('₹100.00')
})

test('the statement downloads as a CSV built from the server figures', async () => {
  setup(); renderApp('/suppliers/vendor1')
  await screen.findByRole('heading', { name: 'Asha Wholesale' })
  let saved = ''
  const create = vi.fn((blob: Blob) => { void blob.text().then(t => { saved = t }); return 'blob:x' })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }))
  await userEvent.click(await screen.findByRole('button', { name: 'Download statement (CSV)' }))
  await waitFor(() => expect(saved).toContain('"Balance owed"'))
  expect(saved.split('\r\n')[0]).toBe('"Date","Entry","Reference","Purchases","Payments","Balance"')
  expect(saved).toContain('"2026-09-20","Payment (UPI)","UTR9","","150.00","100.00"')
})

test('a payment from the account posts a decimal amount with a stable request key', async () => {
  const calls = setup()
  renderApp('/suppliers/vendor1')
  await userEvent.click(await screen.findByRole('button', { name: 'Record payment' }))
  expect(screen.getByText(/settles the oldest purchases first/)).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Amount (₹)'), '25.50')
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record payment' }))
  await waitFor(() => expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/payments'))?.body).toMatchObject({ amount: '25.50', payment_method: 'cash' }))
  expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/payments'))?.body).not.toHaveProperty('purchase_uuid')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(localStorage.getItem('storely.supplier-payment:u1:s1:vendor1')).toBeNull()
})

test('Pay on one purchase settles only that purchase, and Pay all fills what is owed on it', async () => {
  const calls = setup()
  renderApp('/suppliers/vendor1')
  await userEvent.click(await screen.findByRole('button', { name: 'Pay invoice A-2' }))
  const dialog = screen.getByRole('dialog', { name: 'Pay Asha Wholesale' })
  expect(within(dialog).getByText(/Paying/)).toHaveTextContent('Invoice A-2')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Pay all ₹40.00' }))
  expect(within(dialog).getByLabelText('Amount (₹)')).toHaveValue('40')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }))
  await waitFor(() => expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/payments'))?.body).toMatchObject({ amount: '40', purchase_uuid: 'r2' }))
})

test('uncertain supplier payment retries the saved payload', async () => {
  const calls = setup('owner', false, true)
  renderApp('/suppliers/vendor1')
  await userEvent.click(await screen.findByRole('button', { name: 'Record payment' }))
  await userEvent.type(screen.getByLabelText('Amount (₹)'), '25.50')
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record payment' }))
  await screen.findByText('Response interrupted.')
  expect(screen.getByLabelText('Amount (₹)')).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Retry payment' }))
  await waitFor(() => expect(calls.filter(c => c.method === 'POST' && c.path.endsWith('/payments'))).toHaveLength(2))
  const payments = calls.filter(c => c.method === 'POST' && c.path.endsWith('/payments'))
  expect(payments[0]?.body).toEqual(payments[1]?.body)
})

test('a definite refusal frees the payment form so it can be corrected', async () => {
  fakeApi([
    ...SIGNED_IN, ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Shop', role: 'owner' }]),
    ok('GET', '/v1/shops/s1/suppliers', [supplier]),
    ok('GET', '/v1/shops/s1/suppliers/vendor1/statement', STATEMENT),
    ok('POST', '/v1/shops/s1/suppliers/vendor1/payments', { error: { code: 'bad_payment', message: 'Payment cannot exceed the supplier balance' } }, 422),
  ])
  renderApp('/suppliers/vendor1')
  await userEvent.click(await screen.findByRole('button', { name: 'Record payment' }))
  await userEvent.type(screen.getByLabelText('Amount (₹)'), '999')
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record payment' }))
  expect(await screen.findByText(/cannot exceed the supplier balance/)).toBeInTheDocument()
  expect(screen.getByLabelText('Amount (₹)')).toBeEnabled()
  expect(localStorage.getItem('storely.supplier-payment:u1:s1:vendor1')).toBeNull()
})

test('an unknown supplier address says so instead of staying blank', async () => {
  setup(); renderApp('/suppliers/nobody')
  expect(await screen.findByText('Supplier not found')).toBeInTheDocument()
})

test('Record purchase on a supplier account opens the workspace with that supplier chosen', async () => {
  fakeApi([
    ...SIGNED_IN, ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Shop', role: 'owner' }]),
    ok('GET', /\/products\?/, { items: [], total: 0, next_cursor: null }),
    ok('GET', '/v1/shops/s1/suppliers', [supplier]),
    ok('GET', '/v1/shops/s1/suppliers/vendor1/statement', STATEMENT),
  ])
  renderApp('/suppliers/vendor1')
  await userEvent.click(await screen.findByRole('link', { name: 'Record purchase' }))
  expect(await screen.findByRole('heading', { name: 'Record purchase' })).toBeInTheDocument()
  expect(await screen.findByText('Asha Wholesale')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument()
})

test('supplier filters live in the address, so a shared or revisited link keeps them', async () => {
  setup()
  renderApp('/suppliers?q=missing')
  expect(await screen.findByText('No suppliers match')).toBeInTheDocument()
  expect(screen.getByLabelText('Search suppliers')).toHaveValue('missing')
})

test('staff are kept out of suppliers and purchase invoices', async () => {
  const calls = setup('staff')
  renderApp('/suppliers')
  expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument()
  expect(calls.some(c => c.path.endsWith('/suppliers') || c.path.includes('/purchase-receipts'))).toBe(false)
})

const REVERSAL = {
  ...STATEMENT,
  purchases: [{ ...STATEMENT.purchases[0]!, reversed_at: '2026-11-03T10:00:00Z', reversal_reason: 'Entered twice', balance_due: null }, STATEMENT.purchases[1]!],
  payments: [
    { ...STATEMENT.payments[0]!, uuid: 'payX', reversed_at: '2026-11-03T11:00:00Z', reversal_reason: 'Wrong supplier' },
    { uuid: 'pay2', payment_date: '2026-09-21', amount: '30.00', payment_method: 'cash', reference: null, notes: null, reversed_at: null, reversal_reason: null, allocations: [{ purchase_uuid: 'r2', invoice_number: 'A-2', purchase_date: '2026-09-10', amount: '30.00' }] },
  ],
  ledger: [
    ...STATEMENT.ledger.slice(0, 2),
    { kind: 'purchase_reversal', uuid: 'r1', date: '2026-11-03', reference: 'A-1', method: null, debit: '0', credit: '160.00', balance: '90.00' },
    { kind: 'payment_reversal', uuid: 'payX', date: '2026-11-03', reference: 'UTR9', method: 'upi', debit: '150.00', credit: '0', balance: '240.00' },
  ],
}

test('reversed purchases and payments stay listed, flagged, and the statement shows their reversal entries', async () => {
  fakeApi([
    ...SIGNED_IN, ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Shop', role: 'owner' }]),
    ok('GET', '/v1/shops/s1/suppliers', [supplier]),
    ok('GET', '/v1/shops/s1/suppliers/vendor1/statement', REVERSAL),
  ])
  renderApp('/suppliers/vendor1')
  await screen.findByRole('heading', { name: 'Asha Wholesale' })
  const purchases = within(await screen.findByRole('region', { name: 'Purchases' }))
  expect(purchases.getByText('Reversed', { selector: '.payment-badge' })).toBeInTheDocument()
  const payments = within(screen.getByRole('region', { name: 'Payments' }))
  expect(payments.getByText('Reversed', { selector: '.payment-badge' })).toBeInTheDocument()
  expect(payments.getAllByRole('button', { name: /^Reverse payment of/ })).toHaveLength(1)
  const statement = within(screen.getByRole('region', { name: 'Statement' }))
  expect(statement.getByText('Purchase reversed')).toBeInTheDocument()
  expect(statement.getByText(/Payment reversed · UPI/)).toBeInTheDocument()
})

test('reversing a payment says where it had been applied and sends the reason', async () => {
  const calls = fakeApi([
    ...SIGNED_IN, ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Shop', role: 'owner' }]),
    ok('GET', '/v1/shops/s1/suppliers', [supplier]),
    ok('GET', '/v1/shops/s1/suppliers/vendor1/statement', STATEMENT),
    ok('POST', '/v1/shops/s1/suppliers/vendor1/payments/pay1/reverse', { uuid: 'pay1' }),
  ])
  renderApp('/suppliers/vendor1')
  await userEvent.click(await screen.findByRole('button', { name: /^Reverse payment of ₹150.00/ }))
  const dialog = screen.getByRole('dialog', { name: 'Reverse payment' })
  expect(within(dialog).getByText(/make ₹100.00 owed again on invoice A-1/)).toBeInTheDocument()
  expect(within(dialog).getByText(/make ₹50.00 owed again on invoice A-2/)).toBeInTheDocument()
  await userEvent.type(within(dialog).getByLabelText('Why is this being reversed?'), 'Paid the wrong supplier')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Reverse payment' }))
  await waitFor(() => expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/pay1/reverse'))?.body).toEqual({ reason: 'Paid the wrong supplier' }))
})
