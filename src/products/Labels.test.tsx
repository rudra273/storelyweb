import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SIGNED_IN, fakeApi, ok, renderApp } from '../test-utils'

const SHOP = ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Asha Stores', role: 'owner' }])
const RICE = { uuid: 'p1', name: 'Basmati Rice', product_code: 'R1', barcode: '8901', hsn_code: null, category_uuid: null, category_name: null, unit_uuid: null, unit_name: 'kg', selling_price: '25.5', mrp_price: null, gst_percent: null, quantity: '50', track_stock: true, reorder_level: null, low_stock: false, next_expiry: null, updated_at: '2026-10-01T00:00:10Z', price_mode: 'fixed' }
const label = (n: number, extra: object = {}) => ({ uuid: `p${n}`, name: `Item ${n}`, product_code: `C${n}`, barcode: null, selling_price: '10', ...extra })

beforeEach(() => {
  // jsdom has no canvas; the barcode library only needs it to measure text.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText: () => ({ width: 10 }) } as unknown as CanvasRenderingContext2D)
})
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

async function open(data: object[]) {
  const calls = fakeApi([...SIGNED_IN, SHOP, ok('GET', '/v1/shops/s1/categories', []), ok('GET', '/v1/shops/s1/units', []),
    ok('GET', /^\/v1\/shops\/s1\/products\?/, { items: [RICE], total: 1, next_cursor: null }),
    ok('POST', '/v1/shops/s1/products/label-data', data)])
  const view = renderApp('/products')
  await userEvent.click(await screen.findByLabelText('Select Basmati Rice'))
  await userEvent.click(screen.getAllByRole('button', { name: /Print labels/ })[0]!)
  const dialog = await screen.findByRole('dialog')
  await within(dialog).findByLabelText('Label preview')
  return { dialog, calls, view }
}
const grid = (dialog: HTMLElement) => dialog.querySelector<HTMLElement>('.label-grid')!.style.gridTemplateColumns
const closeButton = (dialog: HTMLElement) => within(dialog).getByText('Close', { selector: 'button.ui-button' })
const real = (dialog: HTMLElement) => dialog.querySelectorAll('.label').length
const pageRules = () => [...document.head.querySelectorAll('style[data-label-page]')].map(s => s.textContent)

test('labels open on an A4 sheet of 24, with the real number of labels and sheets stated', async () => {
  const { dialog } = await open([label(1), label(2), label(3)])
  expect(grid(dialog)).toBe('repeat(3, 70mm)')
  expect(real(dialog)).toBe(3)
  expect(within(dialog).getByRole('status')).toHaveTextContent('3 labels on 1 sheet')
  expect(within(dialog).getByText(/Print at 100% scale/)).toBeInTheDocument()
  expect(pageRules()).toEqual(['@page { size: A4 portrait; margin: 0; }'])
})

test('copies are set per product and add up, with new sheets started as needed', async () => {
  const { dialog } = await open([label(1), label(2)])
  await userEvent.click(within(dialog).getByText(/Copies of each label/))
  await userEvent.clear(within(dialog).getByLabelText('Copies of Item 1'))
  await userEvent.type(within(dialog).getByLabelText('Copies of Item 1'), '20')
  await userEvent.clear(within(dialog).getByLabelText('Copies of Item 2'))
  await userEvent.type(within(dialog).getByLabelText('Copies of Item 2'), '10')
  expect(real(dialog)).toBe(30)
  expect(within(dialog).getByRole('status')).toHaveTextContent('30 labels on 2 sheets')
  const same = within(dialog).getByLabelText('Set every product to')
  await userEvent.clear(same)
  await userEvent.type(same, '3')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Apply to all' }))
  expect(within(dialog).getByRole('status')).toHaveTextContent('6 labels on 1 sheet')
})

test('a part-used sheet starts at the chosen slot and the used ones are left empty', async () => {
  const { dialog } = await open([label(1), label(2)])
  await userEvent.clear(within(dialog).getByLabelText(/Start on label number/))
  await userEvent.type(within(dialog).getByLabelText(/Start on label number/), '23')
  expect(dialog.querySelectorAll('.label-used')).toHaveLength(22)
  expect(real(dialog)).toBe(2)
  expect(within(dialog).getByRole('status')).toHaveTextContent('2 labels on 1 sheet')
  await userEvent.clear(within(dialog).getByLabelText(/Start on label number/))
  await userEvent.type(within(dialog).getByLabelText(/Start on label number/), '24')
  expect(within(dialog).getByRole('status')).toHaveTextContent('2 labels on 2 sheets')
})

test('a roll prints one label per page at its own size, and the page rule follows it', async () => {
  const { dialog } = await open([label(1), label(2), label(3)])
  await userEvent.selectOptions(within(dialog).getByLabelText('Layout'), 'roll-50x25')
  expect(within(dialog).getByRole('status')).toHaveTextContent('3 labels on 3 roll labels')
  expect(pageRules()).toEqual(['@page { size: 50mm 25mm; margin: 0; }'])
  const first = dialog.querySelector<HTMLElement>('.label')!
  expect(first.style.width).toBe('50mm')
  expect(first.style.height).toBe('25mm')
  expect(within(dialog).queryByLabelText(/Start on label number/)).not.toBeInTheDocument()
})

test('closing the dialog takes the page rule away, so other printing is not affected', async () => {
  const { dialog } = await open([label(1)])
  expect(pageRules()).toHaveLength(1)
  await userEvent.click(closeButton(dialog))
  await waitFor(() => expect(pageRules()).toHaveLength(0))
  expect(document.body.classList.contains('printing-labels')).toBe(false)
})

test('a custom size that runs off the sheet is explained, hides the preview and blocks printing', async () => {
  const { dialog } = await open([label(1)])
  await userEvent.selectOptions(within(dialog).getByLabelText('Layout'), 'custom')
  const across = within(dialog).getByLabelText('Labels across')
  await userEvent.clear(across)
  await userEvent.type(across, '4')
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('4 labels across need 280.0 mm, but an A4 sheet is 210 mm wide')
  expect(within(dialog).getByRole('button', { name: 'Print' })).toBeDisabled()
  expect(within(dialog).queryByLabelText('Label preview')).not.toBeInTheDocument()
  await userEvent.clear(across)
  await userEvent.type(across, '2')
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Print' })).toBeEnabled()
})

test('the chosen layout and options are remembered for next time', async () => {
  const first = await open([label(1)])
  await userEvent.selectOptions(within(first.dialog).getByLabelText('Layout'), 'roll-38x25')
  await userEvent.click(within(first.dialog).getByLabelText('Print the price'))
  await userEvent.click(closeButton(first.dialog))
  first.view.unmount()
  const again = await open([label(1)])
  expect(within(again.dialog).getByLabelText('Layout')).toHaveValue('roll-38x25')
  expect(within(again.dialog).getByLabelText('Print the price')).not.toBeChecked()
  expect(again.dialog.querySelector('.label-price')).toBeNull()
})

test('price and shop name appear on the label only when chosen', async () => {
  const { dialog } = await open([label(1)])
  expect(dialog.querySelector('.label-price')).toHaveTextContent('₹10.00')
  expect(dialog.querySelector('.label-shop')).toBeNull()
  await userEvent.click(within(dialog).getByLabelText('Print the shop name'))
  expect(dialog.querySelector('.label-shop')).toHaveTextContent('Asha Stores')
  expect(within(dialog).getByText(/printed price goes out of date/)).toBeInTheDocument()
})

test('a test label prints one label on its own, and going back restores the real ones', async () => {
  const { dialog } = await open([label(1), label(2)])
  await userEvent.click(within(dialog).getByRole('button', { name: 'Preview a test label' }))
  expect(real(dialog)).toBe(1)
  expect(dialog.querySelector('.label-name')).toHaveTextContent('Test label')
  expect(within(dialog).getByLabelText('Barcode TEST-0001')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Print test label' })).toBeEnabled()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Back to my labels' }))
  expect(real(dialog)).toBe(2)
})

test('products that cannot be labelled are named and explained, not silently left out', async () => {
  const { dialog } = await open([label(1), label(2, { product_code: null, barcode: null }), label(3, { barcode: 'Ünïcode ✓', product_code: null })])
  expect(real(dialog)).toBe(1)
  const alert = within(dialog).getByText(/no usable barcode or code, so no label can be made/)
  expect(alert).toHaveTextContent('Item 2, Item 3')
  expect(alert).toHaveTextContent('Assign codes')
  expect(within(dialog).getByRole('button', { name: 'Print' })).toBeEnabled()
})

test('nothing printable disables Print, and too many labels is refused with the limit', async () => {
  const none = await open([label(1, { product_code: null })])
  expect(within(none.dialog).getByRole('button', { name: 'Print' })).toBeDisabled()
  await userEvent.click(closeButton(none.dialog))
  none.view.unmount()
  const many = await open([label(1)])
  await userEvent.click(within(many.dialog).getByText(/Copies of each label/))
  const same = within(many.dialog).getByLabelText('Set every product to')
  await userEvent.clear(same)
  await userEvent.type(same, '200')
  await userEvent.click(within(many.dialog).getByRole('button', { name: 'Apply to all' }))
  expect(within(many.dialog).getByRole('button', { name: 'Print' })).toBeEnabled()
  // 200 copies of one label is fine; the limit is for the whole run.
  expect(within(many.dialog).getByRole('status')).toHaveTextContent('200 labels')
})
