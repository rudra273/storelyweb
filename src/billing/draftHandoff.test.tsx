import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { focusManager } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SIGNED_IN, fakeApi, ok, renderApp } from '../test-utils'
import { installInvoiceLocks } from './checkout/invoiceLocksTestSupport'

beforeEach(() => installInvoiceLocks())
afterEach(() => { vi.unstubAllGlobals(); focusManager.setFocused(undefined) })

const SHOP = ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Asha Stores', role: 'owner' }])
const product = { uuid: 'p1', name: 'Rice', selling_price: '100.00', quantity: '10', barcode: '8901', gst_percent: '18' }
const products = ok('GET', /^\/v1\/shops\/s1\/products\?/, { items: [product], next_cursor: null, total: 1 })
const lookup = ok('GET', /^\/v1\/shops\/s1\/products\/lookup\?code=8901$/, product)
const preview = {
  reviewed_context: `br1:${'c'.repeat(64)}`,
  subtotal: '100.00',
  discount_amount: '0.00',
  taxable_amount: '84.75',
  cgst_amount: '7.63',
  sgst_amount: '7.62',
  igst_amount: '0.00',
  round_off_amount: '0.00',
  total: '100.00',
  lines: [{ product_uuid: 'p1', name: 'Rice', quantity: '1', unit_price: '100.00', taxable_value: '84.75', gst: '15.25', amount: '100.00' }],
}
const SETTINGS = {
  revision: 's1:9',
  shop_name: 'Asha Stores', shop_phone: null, shop_email: null, shop_gstin: '27ABCDE1234F1Z5', shop_address: 'Pune',
  gst_registered: true, gst_scheme: 'regular', invoice_title: 'TAX INVOICE', footer_text: 'Thank you.',
  paper_size: 'a4', upi_id: null, terms_text: null, bank_details: null, round_off_total: true,
  default_tax_mode: 'inclusive' as const, round_off_mode: 'nearest' as const, round_off_increment: '1.00',
  series_name: 'Default', format_template: 'INV/{FY}/{SEQ}', sequence_padding: 4,
  reset_period: 'financial_year' as const, next_sequence: 12, next_bill_number_preview: 'INV/2627/0012',
  show: {},
}

async function scan(code: string) {
  await userEvent.type(await screen.findByLabelText('Scan barcode or search products'), `${code}{Enter}`)
}

test('Send to another device publishes draft handoff, clears cart, and refreshes cloud handoffs', async () => {
  let handoffs: Record<string, unknown>[] = []
  const calls = fakeApi([
    ...SIGNED_IN, SHOP, products, lookup,
    ok('GET', '/v1/shops/s1/categories', []),
    ok('GET', '/v1/shops/s1/invoice-settings', SETTINGS),
    ok('POST', '/v1/shops/s1/bills/preview', preview),
    ok('GET', '/v1/shops/s1/draft-handoffs', () => ({ items: handoffs })),
    ok('POST', '/v1/shops/s1/draft-handoffs', (_path: string, body: unknown) => {
      const input = body as { source_device_label: string; label: string; items: unknown[]; metadata: Record<string, unknown> }
      const created = {
        uuid: 'h1',
        source_device_label: input.source_device_label,
        label: input.label,
        item_count: input.items.length,
        items: input.items,
        metadata: input.metadata,
        status: 'available',
        claimed_by_device: null,
        claimed_at: null,
        created_at: '2026-10-15T12:00:00Z',
      }
      handoffs = [created]
      return created
    }, 201),
  ])

  renderApp('/billing/new')
  const sendBtn = await screen.findByRole('button', { name: 'Send to another device' })
  expect(sendBtn).toBeDisabled()

  await scan('8901')
  await screen.findByLabelText('Quantity for Rice')
  expect(sendBtn).toBeEnabled()

  await userEvent.click(screen.getByRole('button', { name: 'Add customer' }))
  await userEvent.type(screen.getByLabelText('Name'), 'Meera')
  await userEvent.type(screen.getByLabelText('Invoice notes'), 'Pack separately')
  fireEvent.change(screen.getByLabelText('Invoice date'), { target: { value: '2026-10-15' } })

  await userEvent.click(sendBtn)

  await waitFor(() => {
    const post = calls.find(c => c.method === 'POST' && c.path === '/v1/shops/s1/draft-handoffs')
    expect(post).toBeDefined()
    expect(post?.body).toMatchObject({
      source_device_label: 'Web browser',
      label: 'Meera',
      metadata: {
        customer: expect.objectContaining({ customer_name: 'Meera' }),
        billType: 'b2c',
        discount: '0',
        discountMode: 'percent',
        taxMode: null,
        roundOffMode: null,
        roundOffIncrement: null,
        billDate: '2026-10-15',
        notes: 'Pack separately',
      },
    })
    expect((post!.body as { items: Record<string, unknown>[] }).items).toEqual([
      expect.objectContaining({ product_uuid: 'p1', name: 'Rice', quantity: '1' }),
    ])
  })

  expect(await screen.findByText('Scan or search to start this invoice')).toBeInTheDocument()
  expect(screen.getByLabelText('Invoice notes')).toHaveValue('')
  const handoffsSection = await screen.findByRole('region', { name: 'Cloud handoffs' })
  expect(within(handoffsSection).getByText('Meera')).toBeInTheDocument()
  expect(within(handoffsSection).getByText(/From Web browser/)).toBeInTheDocument()
})

test('lists remote cloud handoffs and claims one into NewBill', async () => {
  let available = [
    {
      uuid: 'h-remote-1',
      source_device_label: 'Android POS',
      label: 'Ravi Kumar',
      item_count: 2,
      status: 'available',
      created_at: '2026-10-15T12:15:00Z',
    },
  ]
  const claimedPayload = {
    uuid: 'h-remote-1',
    source_device_label: 'Android POS',
    label: 'Ravi Kumar',
    item_count: 2,
    status: 'claimed',
    claimed_by_device: 'Web browser',
    claimed_at: '2026-10-15T12:16:00Z',
    created_at: '2026-10-15T12:15:00Z',
    items: [
      {
        product_uuid: 'p1',
        name: 'Rice',
        quantity: '2',
        selling_price: '100.00',
        gst_percent: '18',
        barcode: '8901',
      },
      {
        kind: 'custom',
        key: 'c-1',
        name: 'Delivery',
        quantity: '1',
        unit_price: '40.00',
        gst_percent: '0',
      },
    ],
    metadata: {
      customer: {
        customer_name: 'Ravi Kumar',
        customer_phone: '9876543210',
        customer_gstin: '',
        customer_gst_legal_name: '',
        customer_gst_trade_name: '',
        customer_address: 'Pune',
        place_of_supply_state_code: '',
      },
      billType: 'b2c',
      discount: '10',
      discountMode: 'amount',
      taxMode: 'exclusive',
      roundOffMode: 'up',
      roundOffIncrement: '5.00',
      billDate: '2026-10-15',
      notes: 'Ring bell',
    },
  }
  const calls = fakeApi([
    ...SIGNED_IN, SHOP, products,
    ok('GET', '/v1/shops/s1/categories', []),
    ok('GET', '/v1/shops/s1/invoice-settings', SETTINGS),
    ok('POST', '/v1/shops/s1/bills/preview', preview),
    ok('GET', '/v1/shops/s1/draft-handoffs', () => ({ items: available })),
    ok('POST', '/v1/shops/s1/draft-handoffs/h-remote-1/claim', () => {
      available = []
      return claimedPayload
    }),
  ])

  renderApp('/billing/new')
  const section = await screen.findByRole('region', { name: 'Cloud handoffs' })
  expect(within(section).getByText('Ravi Kumar')).toBeInTheDocument()
  expect(within(section).getByText(/From Android POS/)).toBeInTheDocument()

  await userEvent.click(within(section).getByRole('button', { name: 'Take over' }))

  await waitFor(() => {
    const claim = calls.find(c => c.method === 'POST' && c.path === '/v1/shops/s1/draft-handoffs/h-remote-1/claim')
    expect(claim?.body).toEqual({ device_label: 'Web browser' })
  })

  expect(await screen.findByLabelText('Quantity for Rice')).toHaveValue('2')
  expect(screen.getByLabelText('Quantity for Delivery')).toHaveValue('1')
  expect(screen.getByLabelText('Invoice notes')).toHaveValue('Ring bell')
  expect(screen.getByLabelText('Invoice date')).toHaveValue('2026-10-15')
  expect(screen.getByLabelText('Discount mode')).toHaveValue('amount')
  expect(screen.getByLabelText('Tax mode')).toHaveValue('exclusive')
  expect(screen.getByLabelText('Round-off')).toHaveValue('up')
  expect(screen.getByLabelText('Round-off increment')).toHaveValue('5.00')
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Cloud handoffs' })).not.toBeInTheDocument())
})

test('handles 409 draft_already_claimed with a clear error message and refetches handoffs', async () => {
  let available = [
    {
      uuid: 'h-race-1',
      source_device_label: 'Android POS',
      label: 'Asha',
      item_count: 1,
      status: 'available',
      created_at: '2026-10-15T12:20:00Z',
    },
  ]
  const calls = fakeApi([
    ...SIGNED_IN, SHOP, products,
    ok('GET', '/v1/shops/s1/categories', []),
    ok('GET', '/v1/shops/s1/invoice-settings', SETTINGS),
    ok('GET', '/v1/shops/s1/draft-handoffs', () => ({ items: available })),
    ok('POST', '/v1/shops/s1/draft-handoffs/h-race-1/claim', () => {
      available = []
      return { error: { code: 'draft_already_claimed', message: 'Draft handoff was already claimed.' } }
    }, 409),
  ])

  renderApp('/billing/new')
  const section = await screen.findByRole('region', { name: 'Cloud handoffs' })
  await userEvent.click(within(section).getByRole('button', { name: 'Take over' }))

  expect(await screen.findByText('This draft was already claimed on another device.')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Cloud handoffs' })).not.toBeInTheDocument())
  expect(calls.filter(c => c.method === 'GET' && c.path === '/v1/shops/s1/draft-handoffs').length).toBeGreaterThanOrEqual(2)
})

test('discards a cloud handoff and preserves browser-local held invoice label', async () => {
  const initialAvailable = [
    {
      uuid: 'h-discard-1',
      source_device_label: 'iPad Counter',
      label: 'Walk-in customer',
      item_count: 1,
      status: 'available',
      created_at: '2026-10-15T12:25:00Z',
    },
  ]
  const calls = fakeApi([
    ...SIGNED_IN, SHOP, products, lookup,
    ok('GET', '/v1/shops/s1/categories', []),
    ok('GET', '/v1/shops/s1/invoice-settings', SETTINGS),
    ok('POST', '/v1/shops/s1/bills/preview', preview),
    ok('GET', '/v1/shops/s1/draft-handoffs', () => ({
      items: calls.some(c => c.method === 'DELETE' && c.path === '/v1/shops/s1/draft-handoffs/h-discard-1') ? [] : initialAvailable,
    })),
    ok('DELETE', '/v1/shops/s1/draft-handoffs/h-discard-1', null, 204),
  ])

  renderApp('/billing/new')
  const section = await screen.findByRole('region', { name: 'Cloud handoffs' })
  await userEvent.click(within(section).getByRole('button', { name: 'Discard' }))

  await waitFor(() => expect(calls.some(c => c.method === 'DELETE' && c.path === '/v1/shops/s1/draft-handoffs/h-discard-1')).toBe(true))
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Cloud handoffs' })).not.toBeInTheDocument())

  // Hold a browser-local invoice and confirm its browser-only label stays intact.
  await scan('8901')
  await screen.findByLabelText('Quantity for Rice')
  await userEvent.click(screen.getByRole('button', { name: 'Hold invoice' }))
  const heldSection = await screen.findByRole('region', { name: 'Held invoices' })
  expect(within(heldSection).getByText(/Saved in this browser for this account and shop\./)).toBeInTheDocument()
})
