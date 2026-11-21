import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { focusManager, QueryClient } from '@tanstack/react-query'
import { SIGNED_IN, fakeApi, ok, renderApp } from '../../test-utils'

afterEach(() => { vi.unstubAllGlobals(); focusManager.setFocused(undefined) })

const SHOP = (role: string) => ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Asha Stores', role }])
const KEYS = ['show_invoice_title', 'show_shop_name', 'show_shop_address', 'show_shop_phone', 'show_shop_email', 'show_shop_gstin', 'show_customer_name', 'show_customer_phone', 'show_customer_address', 'show_customer_gstin', 'show_customer_legal_name', 'show_customer_trade_name', 'show_customer_place_of_supply', 'show_invoice_number', 'show_invoice_date', 'show_invoice_place_of_supply', 'show_invoice_supply_type', 'show_payment_details', 'show_gst_breakdown', 'show_item_serial_column', 'show_item_name_column', 'show_hsn_column', 'show_quantity_column', 'show_rate_column', 'show_gst_percent_column', 'show_gst_amount_column', 'show_amount_column', 'show_subtotal', 'show_discount', 'show_taxable_amount', 'show_cgst_sgst_igst', 'show_gst_total', 'show_grand_total', 'show_footer_text', 'show_upi_qr', 'show_amount_in_words', 'show_hsn_summary']
const SETTINGS = {
  revision: 's1:7',
  shop_name: 'Asha Stores', shop_phone: null, shop_email: null, shop_gstin: '27ABCDE1234F1Z5', shop_address: 'Pune',
  gst_registered: true, gst_scheme: 'regular', invoice_title: 'TAX INVOICE', footer_text: 'Thank you for your business.',
  paper_size: 'a4', upi_id: null, terms_text: null, bank_details: null, round_off_total: true,
  show: Object.fromEntries(KEYS.map(k => [k, true])),
}

test('the preview follows the settings as they are edited, and only changes are saved', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/invoice-settings', SETTINGS),
    ok('PATCH', '/v1/shops/s1/invoice-settings', { ...SETTINGS, footer_text: 'Visit again', show: { ...SETTINGS.show, show_hsn_column: false } })])
  renderApp('/settings')
  const preview = await screen.findByRole('complementary', { name: 'Invoice preview' })
  expect(within(preview).getByText('TAX INVOICE')).toBeInTheDocument()
  expect(within(preview).getByText('Rupees Three Hundred Twenty Eight Only')).toBeInTheDocument()
  expect(within(preview).getAllByRole('columnheader', { name: 'HSN/SAC' }).length).toBeGreaterThan(0)
  await userEvent.click(screen.getByRole('tab', { name: 'Invoice appearance' }))
  await userEvent.click(screen.getByLabelText('HSN / SAC'))
  expect(within(within(preview).getByRole('table', { name: '' })).queryByRole('columnheader', { name: 'HSN/SAC' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('tab', { name: 'Pricing & tax' }))
  await userEvent.click(screen.getByLabelText(/Not GST-registered/))
  expect(within(preview).getByText('INVOICE')).toBeInTheDocument()
  expect(screen.getByText(/changes how new bills are taxed/)).toBeInTheDocument()
  await userEvent.click(screen.getByLabelText(/Regular GST/))
  await userEvent.click(screen.getByRole('tab', { name: 'Invoice appearance' }))
  const footer = screen.getByLabelText('Footer')
  await userEvent.clear(footer)
  await userEvent.type(footer, 'Visit again')
  expect(within(preview).getByText('Visit again')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  expect(await screen.findByText(/Saved. Phones get the new layout/)).toBeInTheDocument()
  await waitFor(() => expect(calls.find(c => c.method === 'PATCH')?.body).toEqual({ footer_text: 'Visit again', show: { show_hsn_column: false }, expected_revision: 's1:7' }))
})

test('thermal paper can be saved as the default and the unsaved state is shown', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/invoice-settings', { ...SETTINGS, paper_size: '58mm' }),
    ok('PATCH', '/v1/shops/s1/invoice-settings', { ...SETTINGS, paper_size: '80mm' })])
  renderApp('/settings?tab=printing')
  const paper = await screen.findByLabelText('Default paper')
  expect(paper).toHaveValue('58mm')
  expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  await userEvent.selectOptions(paper, '80mm')
  expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  expect(screen.getByLabelText('Preview paper')).toHaveValue('80mm')
  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  await waitFor(() => expect(calls.find(c => c.method === 'PATCH')?.body).toEqual({ paper_size: '80mm', expected_revision: 's1:7' }))
})

test('stale settings keep typed input and rebase only dirty fields and show keys after explicit review', async () => {
  const latest = { ...SETTINGS, revision: 's1:8', shop_phone: '9876543210', footer_text: 'Remote footer', show: { ...SETTINGS.show, show_item_name_column: false } }
  let changedElsewhere = false
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/invoice-settings', () => changedElsewhere ? latest : SETTINGS), ok('PATCH', '/v1/shops/s1/invoice-settings', () => { changedElsewhere = true; return { error: { code: 'settings_changed', message: 'Settings changed elsewhere' } } }, 409)])
  renderApp('/settings?tab=invoice')
  await userEvent.click(await screen.findByRole('tab', { name: 'Invoice appearance' }))
  const footer = screen.getByLabelText('Footer')
  await userEvent.clear(footer)
  await userEvent.type(footer, 'My footer')
  await userEvent.click(screen.getByLabelText('HSN / SAC'))
  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  expect(await screen.findByText('Settings changed elsewhere')).toBeInTheDocument()
  expect(footer).toHaveValue('My footer')
  expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
  expect(calls.find(call => call.method === 'PATCH')?.body).toEqual({ footer_text: 'My footer', show: { show_hsn_column: false }, expected_revision: 's1:7' })
  await userEvent.click(screen.getByRole('button', { name: 'Review latest settings' }))
  await screen.findByRole('region', { name: 'Latest settings review' })
  expect(footer).toHaveValue('My footer')
  await userEvent.click(screen.getByRole('button', { name: 'Keep my edits with latest settings' }))
  expect(footer).toHaveValue('My footer')
  expect(screen.getByLabelText('HSN / SAC')).not.toBeChecked()
  expect(screen.getByLabelText('Item name')).not.toBeChecked()
  await userEvent.click(screen.getByRole('tab', { name: 'Shop details' }))
  expect(screen.getByRole('textbox', { name: 'Phone' })).toHaveValue('9876543210')
  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  await waitFor(() => expect(calls.filter(call => call.method === 'PATCH')).toHaveLength(2))
  expect(calls.filter(call => call.method === 'PATCH')[1]?.body).toEqual({ footer_text: 'My footer', show: { show_hsn_column: false }, expected_revision: 's1:8' })
})

test('a server without aggregate settings revision support cannot receive a settings PATCH', async () => {
  const calls = fakeApi([ok('GET', '/v1/shops/s1/capabilities', { contract_version: 1, shop_id: 's1', role: 'owner', features: {} }), ...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/invoice-settings', SETTINGS)])
  renderApp('/settings?tab=printing')
  await userEvent.selectOptions(await screen.findByLabelText('Default paper'), '80mm')
  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('cannot confirm safe settings editing')
  expect(screen.getByLabelText('Default paper')).toHaveValue('80mm')
  expect(calls.some(call => call.method === 'PATCH')).toBe(false)
})

test('background refetch never advances an edited settings baseline or adds untouched fields to the patch', async () => {
  let remote = false
  const latest = { ...SETTINGS, revision: 's1:8', shop_phone: '9876543210', show: { ...SETTINGS.show, show_item_name_column: false } }
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/invoice-settings', () => remote ? latest : SETTINGS), ok('PATCH', '/v1/shops/s1/invoice-settings', { error: { code: 'settings_changed', message: 'Settings changed elsewhere' } }, 409)])
  renderApp('/settings?tab=invoice')
  const footer = await screen.findByLabelText('Footer')
  await userEvent.clear(footer)
  await userEvent.type(footer, 'My footer')
  remote = true
  act(() => { focusManager.setFocused(false); focusManager.setFocused(true) })
  await waitFor(() => expect(calls.filter(call => call.method === 'GET' && call.path.endsWith('/invoice-settings')).length).toBeGreaterThan(1))
  expect(footer).toHaveValue('My footer')
  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  await screen.findByText('Settings changed elsewhere')
  expect(calls.find(call => call.method === 'PATCH')?.body).toEqual({ footer_text: 'My footer', expected_revision: 's1:7' })
  focusManager.setFocused(undefined)
})

test('leaving settings while capability negotiation is pending never writes from the old editor', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/invoice-settings', SETTINGS)])
  const originalFetch = fetch
  let release!: () => void
  let entered!: () => void
  const ready = new Promise<void>(resolve => { entered = resolve })
  vi.stubGlobal('fetch', (path: string, init: RequestInit) => path.endsWith('/capabilities')
    ? new Promise<Response>(resolve => { release = () => resolve(new Response(JSON.stringify({ contract_version: 1, shop_id: 's1', role: 'owner', features: { settings_revision: 1 } }), { status: 200 })); entered() })
    : originalFetch(path, init))
  const view = renderApp('/settings?tab=printing')
  await userEvent.selectOptions(await screen.findByLabelText('Default paper'), '80mm')
  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  await ready
  view.unmount()
  release()
  await act(async () => { await Promise.resolve() })
  expect(calls.some(call => call.method === 'PATCH')).toBe(false)
})

test('a failed background refresh keeps the mounted settings editor and dirty input', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/invoice-settings', SETTINGS)])
  const originalFetch = fetch
  let unavailable = false
  vi.stubGlobal('fetch', (path: string, init: RequestInit) => unavailable && path.endsWith('/invoice-settings')
    ? Promise.resolve(new Response(JSON.stringify({ error: { code: 'unavailable', message: 'Unavailable' } }), { status: 503 }))
    : originalFetch(path, init))
  renderApp('/settings?tab=invoice')
  const footer = await screen.findByLabelText('Footer')
  await userEvent.clear(footer)
  await userEvent.type(footer, 'My unsaved footer')
  unavailable = true
  act(() => { focusManager.setFocused(false); focusManager.setFocused(true) })
  expect(await screen.findByText(/Latest settings could not be refreshed/)).toBeInTheDocument()
  expect(screen.getByLabelText('Footer')).toBe(footer)
  expect(footer).toHaveValue('My unsaved footer')
})

const PRICING_SETTINGS = { ...SETTINGS, default_gst_percent: '18', default_profit_margin_percent: '0', default_overhead_cost: '0.00' }
for (const [label, field, invalid] of [['Default GST %', 'default_gst_percent', '7'], ['Default profit margin %', 'default_profit_margin_percent', '1.2345'], ['Default overhead cost (₹)', 'default_overhead_cost', '0.001']] as const) {
  test(`invalid edited pricing default ${field} is refused locally and retains input`, async () => {
    const calls = fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/invoice-settings', PRICING_SETTINGS), ok('PATCH', '/v1/shops/s1/invoice-settings', PRICING_SETTINGS)])
    renderApp('/settings?tab=pricing')
    const input = await screen.findByLabelText(label)
    await userEvent.clear(input)
    await userEvent.type(input, invalid)
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'))
    expect(input).toHaveValue(invalid)
    expect(calls.filter(call => call.method === 'PATCH')).toHaveLength(0)
  })
}

test('untouched legacy nonstandard and high-precision defaults stay exact and do not block unrelated settings', async () => {
  const legacy = { ...PRICING_SETTINGS, default_gst_percent: '7.123456789012345678', default_profit_margin_percent: '123.123456789012345678', default_overhead_cost: '999999999999.123456789012345678' }
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/invoice-settings', legacy), ok('PATCH', '/v1/shops/s1/invoice-settings', { ...legacy, footer_text: 'Legacy values retained' })])
  renderApp('/settings?tab=pricing')
  expect(await screen.findByLabelText('Default GST %')).toHaveValue(legacy.default_gst_percent)
  expect(screen.getByLabelText('Default profit margin %')).toHaveValue(legacy.default_profit_margin_percent)
  expect(screen.getByLabelText('Default overhead cost (₹)')).toHaveValue(legacy.default_overhead_cost)
  await userEvent.click(screen.getByRole('tab', { name: 'Invoice appearance' }))
  await userEvent.clear(screen.getByLabelText('Footer'))
  await userEvent.type(screen.getByLabelText('Footer'), 'Legacy values retained')
  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  await waitFor(() => expect(calls.find(call => call.method === 'PATCH')?.body).toEqual({ footer_text: 'Legacy values retained', expected_revision: 's1:7' }))
})

test('valid edited pricing defaults preserve significant decimal precision in the guarded request', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/invoice-settings', PRICING_SETTINGS), ok('PATCH', '/v1/shops/s1/invoice-settings', { ...PRICING_SETTINGS, revision: 's1:8', default_gst_percent: '0.25', default_profit_margin_percent: '1.234', default_overhead_cost: '12.34' })])
  renderApp('/settings?tab=pricing')
  for (const [label, value] of [['Default GST %', '0.2500'], ['Default profit margin %', '1.2340'], ['Default overhead cost (₹)', '12.3400']]) {
    const input = await screen.findByLabelText(label!)
    await userEvent.clear(input)
    await userEvent.type(input, value!)
  }
  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  await waitFor(() => expect(calls.find(call => call.method === 'PATCH')?.body).toEqual({ default_gst_percent: '0.2500', default_profit_margin_percent: '1.2340', default_overhead_cost: '12.3400', expected_revision: 's1:7' }))
})


test('saving pricing defaults invalidates cached product calculations and checkout review', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/invoice-settings', PRICING_SETTINGS), ok('PATCH', '/v1/shops/s1/invoice-settings', { ...PRICING_SETTINGS, default_profit_margin_percent: '12.345', revision: 's1:8' })])
  renderApp('/settings?tab=pricing')
  const margin = await screen.findByLabelText('Default profit margin %')
  await userEvent.clear(margin)
  await userEvent.type(margin, '12.345')
  const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries').mockResolvedValue()
  try {
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4))
    expect(invalidate.mock.calls.map(([filter]) => filter?.queryKey)).toEqual([['bill-preview', 's1'], ['price-preview', 's1'], ['products', 's1'], ['product', 's1']])
  } finally { invalidate.mockRestore() }
})

test('server pricing validation is shown beside the retained edited default', async () => {
  fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/invoice-settings', PRICING_SETTINGS), ok('PATCH', '/v1/shops/s1/invoice-settings', { error: { code: 'validation_error', message: 'Check this value', fields: [{ field: 'default_overhead_cost', message: 'Use two decimal places.' }] } }, 422)])
  renderApp('/settings?tab=pricing')
  const overhead = await screen.findByLabelText('Default overhead cost (₹)')
  await userEvent.clear(overhead)
  await userEvent.type(overhead, '1.25')
  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  await waitFor(() => expect(overhead).toHaveAttribute('aria-invalid', 'true'))
  expect(overhead).toHaveValue('1.25')
})


test('invalid pricing submitted from another tab reveals and focuses the retained default', async () => {
  const calls = fakeApi([...SIGNED_IN, SHOP('owner'), ok('GET', '/v1/shops/s1/invoice-settings', PRICING_SETTINGS)])
  renderApp('/settings?tab=pricing')
  const margin = await screen.findByLabelText('Default profit margin %')
  await userEvent.clear(margin)
  await userEvent.type(margin, '101')
  await userEvent.click(screen.getByRole('tab', { name: 'Invoice appearance' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Pricing & tax' })).toHaveAttribute('aria-selected', 'true'))
  expect(margin).toHaveFocus()
  expect(margin).toHaveValue('101')
  expect(calls.filter(call => call.method === 'PATCH')).toHaveLength(0)
})
