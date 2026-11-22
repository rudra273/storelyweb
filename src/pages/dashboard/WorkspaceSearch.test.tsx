import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { AuthContext, type AuthValue } from '../../auth/context'
import { ShopContext, type ShopValue } from '../../shops/context'
import { AccessContext } from '../../subscriptions/context'
import { fakeApi, ok } from '../../test-utils'
import { WorkspaceSearch } from './WorkspaceSearch'

afterEach(() => vi.unstubAllGlobals())
const product = { uuid: 'p1', name: 'Rice', selling_price: '118', quantity: '10', track_stock: true, unit_name: 'kg', purchase_price: '999' }
const bill = { uuid: 'b1', bill_number: 'INV/0001', customer_name: 'Ravi', total_amount: '118', document_type: 'invoice' }
const customer = { uuid: 'c1', name: 'Ravi', phone: '9876543210', due: '68' }
const page = (items: object[]) => ({ items, total: items.length, next_cursor: null })
const searchPath = (entity: string) => new RegExp(`^/v1/shops/[^/]+/${entity}\\?(?=.*workspace_search=true)`)
function routes(items = true) {
  return [ok('GET', searchPath('products'), page(items ? [product] : [])), ok('GET', searchPath('bills'), page(items ? [bill] : [])), ok('GET', searchPath('customers/accounts'), { items: items ? [customer] : [], has_more: false })]
}
type Scope = { user: string; shop: string; role: 'owner' | 'staff' | null; active: boolean }
const initial: Scope = { user: 'a', shop: 'one', role: 'staff', active: true }
function mount(scope = initial) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tree = (scope: Scope) => <QueryClientProvider client={client}><MemoryRouter><AuthContext.Provider value={{ user: { id: scope.user } } as AuthValue}><ShopContext.Provider value={{ current: { shop_id: scope.shop }, role: scope.role } as ShopValue}><AccessContext.Provider value={{ active: scope.active, pending: false, error: null, entitlement: undefined, refresh: () => {} }}><WorkspaceSearch><p>Normal Home content</p></WorkspaceSearch></AccessContext.Provider></ShopContext.Provider></AuthContext.Provider></MemoryRouter></QueryClientProvider>
  const view = render(tree(scope))
  return { ...view, scope(next: Scope) { view.rerender(tree(next)) } }
}

test('blank Home search sends no search requests; literal text uses all three bounded endpoints and exact detail links', async () => {
  const calls = fakeApi(routes())
  mount()
  expect(screen.getByText('Normal Home content')).toBeInTheDocument()
  expect(calls).toHaveLength(0)
  const text = 'Rice%_\\'
  await userEvent.type(screen.getByLabelText('Search workspace'), text)
  expect(await within(await screen.findByRole('region', { name: 'Products search results' })).findByRole('link', { name: /Rice/ })).toHaveAttribute('href', '/products/p1')
  expect(await within(screen.getByRole('region', { name: 'Invoices search results' })).findByRole('link', { name: /INV\/0001/ })).toHaveAttribute('href', '/billing/b1')
  expect(await within(screen.getByRole('region', { name: 'Customers search results' })).findByRole('link', { name: /Ravi/ })).toHaveAttribute('href', '/customers/c1')
  expect(calls).toHaveLength(3)
  for (const call of calls) {
    const url = new URL(call.path, 'http://localhost')
    expect(url.searchParams.get('q')).toBe(text)
    expect(url.searchParams.get('workspace_search')).toBe('true')
    expect(url.searchParams.get('limit')).toBe('5')
  }
  expect(screen.queryByText('Normal Home content')).not.toBeInTheDocument()
  expect(screen.queryByText('₹999.00')).not.toBeInTheDocument()
})

test('empty successful results are announced without fabricating records', async () => {
  fakeApi(routes(false)); mount()
  await userEvent.type(screen.getByLabelText('Search workspace'), 'missing')
  expect(await screen.findByRole('heading', { name: 'No matching products, invoices or customers' })).toBeInTheDocument()
})

test('one failed area keeps other results and retries only that area', async () => {
  const failed = ok('GET', searchPath('products'), { error: { code: 'unavailable', message: 'Unavailable' } }, 503)
  const calls = fakeApi([failed, ...routes()]); mount()
  await userEvent.type(screen.getByLabelText('Search workspace'), 'Ravi')
  await screen.findByRole('button', { name: 'Retry products search' })
  expect(await screen.findByRole('link', { name: /INV\/0001/ })).toBeInTheDocument()
  expect(await within(screen.getByRole('region', { name: 'Customers search results' })).findByRole('link', { name: /Ravi/ })).toBeInTheDocument()
  expect(screen.queryByText('No matching products, invoices or customers')).not.toBeInTheDocument()
  failed.body = page([product]); failed.status = 200
  await userEvent.click(screen.getByRole('button', { name: 'Retry products search' }))
  expect(await screen.findByRole('link', { name: /Rice/ })).toBeInTheDocument()
  expect(calls.filter(call => call.path.includes('/products?'))).toHaveLength(2)
  expect(calls.filter(call => call.path.includes('/bills?'))).toHaveLength(1)
  expect(calls.filter(call => call.path.includes('/customers/accounts?'))).toHaveLength(1)
})

test('credit notes remain visible with a clear label and their exact existing invoice route', async () => {
  fakeApi([ok('GET', searchPath('bills'), page([{ ...bill, document_type: 'credit_note', bill_number: 'CN/0001' }])), ...routes()]); mount()
  await userEvent.type(screen.getByLabelText('Search workspace'), 'Ravi')
  const link = await screen.findByRole('link', { name: /CN\/0001/ })
  expect(link).toHaveTextContent('Credit note')
  expect(link).toHaveAttribute('href', '/billing/b1')
})

test('clear and Escape restore Home and leave the input focused', async () => {
  const calls = fakeApi(routes()); mount()
  const input = screen.getByLabelText('Search workspace')
  await userEvent.type(input, 'Rice')
  await screen.findByRole('link', { name: /Rice/ })
  await userEvent.keyboard('{Escape}')
  expect(input).toHaveValue('')
  expect(input).toHaveFocus()
  expect(screen.getByText('Normal Home content')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Workspace search results' })).not.toBeInTheDocument()
  await userEvent.type(input, '   ')
  await new Promise(resolve => setTimeout(resolve, 300))
  expect(calls).toHaveLength(3)
  await userEvent.click(screen.getByRole('button', { name: 'Clear workspace search' }))
  expect(input).toHaveFocus()
})

test('an overlong programmatic value is retained but never sent', async () => {
  const calls = fakeApi(routes()); mount()
  const input = screen.getByLabelText('Search workspace')
  fireEvent.change(input, { target: { value: 'x'.repeat(61) } })
  expect(input).toHaveAttribute('maxlength', '60')
  expect(input).toHaveAttribute('aria-invalid', 'true')
  await new Promise(resolve => setTimeout(resolve, 300))
  expect(calls).toHaveLength(0)
})

test('changing the term aborts previous requests and a late reply cannot replace current results', async () => {
  fakeApi(routes())
  const normal = fetch
  const pending: { signal: AbortSignal; resolve: (response: Response) => void }[] = []
  vi.stubGlobal('fetch', (path: string, options: RequestInit) => new URL(path, 'http://localhost').searchParams.get('q') === 'old' ? new Promise<Response>(resolve => { pending.push({ signal: options.signal as AbortSignal, resolve }) }) : normal(path, options))
  mount()
  const input = screen.getByLabelText('Search workspace')
  await userEvent.type(input, 'old')
  await waitFor(() => expect(pending).toHaveLength(3))
  await userEvent.clear(input)
  await userEvent.type(input, 'new')
  expect(pending.every(request => request.signal.aborted)).toBe(true)
  await screen.findByRole('link', { name: /Rice/ })
  await act(async () => { for (const request of pending) request.resolve(new Response(JSON.stringify(page([{ ...product, name: 'Old result' }])))) })
  expect(screen.queryByText('Old result')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Rice/ })).toBeInTheDocument()
})

for (const change of [{ shop: 'two' }, { user: 'b' }, { role: 'owner' as const }]) {
  test(`search state and pending requests reset with scope ${JSON.stringify(change)}`, async () => {
    const pending: { signal: AbortSignal; resolve: (response: Response) => void }[] = []
    vi.stubGlobal('fetch', (_path: string, options: RequestInit) => new Promise<Response>(resolve => pending.push({ signal: options.signal as AbortSignal, resolve })))
    const view = mount()
    await userEvent.type(screen.getByLabelText('Search workspace'), 'old')
    await waitFor(() => expect(pending).toHaveLength(3))
    view.scope({ ...initial, ...change })
    expect(screen.getByLabelText('Search workspace')).toHaveValue('')
    expect(screen.getByText('Normal Home content')).toBeInTheDocument()
    expect(pending.every(request => request.signal.aborted)).toBe(true)
    await act(async () => { for (const request of pending) request.resolve(new Response(JSON.stringify(page([product])))) })
    expect(screen.queryByRole('region', { name: 'Workspace search results' })).not.toBeInTheDocument()
  })
}

for (const scope of [{ ...initial, role: null }, { ...initial, active: false }]) {
  test(`unavailable role/access never issues a search ${JSON.stringify(scope)}`, async () => {
    const calls = fakeApi(routes()); mount(scope)
    expect(screen.getByLabelText('Search workspace')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Search workspace'), { target: { value: 'Rice' } })
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(calls).toHaveLength(0)
  })
}


test('legacy local invoice number gets the same display alias as Android without changing identity', async () => {
  const original = { ...bill, bill_number: 'SHOP-LOCAL-local-42' }
  fakeApi([ok('GET', searchPath('bills'), page([original])), ...routes()]); mount()
  await userEvent.type(screen.getByLabelText('Search workspace'), 'INV-42')
  const link = await screen.findByRole('link', { name: /INV-42/ })
  expect(link).toHaveAttribute('href', '/billing/b1')
  expect(link).not.toHaveTextContent('SHOP-LOCAL-local-42')
  expect(original.bill_number).toBe('SHOP-LOCAL-local-42')
})
