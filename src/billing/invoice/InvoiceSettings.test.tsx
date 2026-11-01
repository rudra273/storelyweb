import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { SIGNED_IN, fakeApi, ok, renderApp } from '../../test-utils'

afterEach(() => vi.unstubAllGlobals())

const SHOP = (role: string) => ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Asha Stores', role }])
const KEYS = ['show_invoice_title', 'show_shop_name', 'show_shop_address', 'show_shop_phone', 'show_shop_email', 'show_shop_gstin', 'show_customer_name', 'show_customer_phone', 'show_customer_address', 'show_customer_gstin', 'show_customer_legal_name', 'show_customer_trade_name', 'show_customer_place_of_supply', 'show_invoice_number', 'show_invoice_date', 'show_invoice_place_of_supply', 'show_invoice_supply_type', 'show_payment_details', 'show_gst_breakdown', 'show_item_serial_column', 'show_item_name_column', 'show_hsn_column', 'show_quantity_column', 'show_rate_column', 'show_gst_percent_column', 'show_gst_amount_column', 'show_amount_column', 'show_subtotal', 'show_discount', 'show_taxable_amount', 'show_cgst_sgst_igst', 'show_gst_total', 'show_grand_total', 'show_footer_text', 'show_upi_qr', 'show_amount_in_words', 'show_hsn_summary']
const SETTINGS = {
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
  await userEvent.click(screen.getByLabelText('HSN / SAC'))
  expect(within(within(preview).getByRole('table', { name: '' })).queryByRole('columnheader', { name: 'HSN/SAC' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByLabelText(/Not GST-registered/))
  expect(within(preview).getByText('BILL')).toBeInTheDocument()
  expect(screen.getByText(/changes how new bills are taxed/)).toBeInTheDocument()
  await userEvent.click(screen.getByLabelText(/Regular GST/))
  const footer = screen.getByLabelText('Footer')
  await userEvent.clear(footer)
  await userEvent.type(footer, 'Visit again')
  expect(within(preview).getByText('Visit again')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
  expect(await screen.findByText(/Saved. Phones get the new layout/)).toBeInTheDocument()
  await waitFor(() => expect(calls.find(c => c.method === 'PATCH')?.body).toEqual({ footer_text: 'Visit again', show: { show_hsn_column: false } }))
})
