import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { SIGNED_IN, fakeApi, ok, renderApp } from '../../test-utils'

afterEach(() => vi.unstubAllGlobals())
const SHOPS = (...shops: { shop_id: string; name: string; role: string }[]) => ok('GET', '/v1/shops', shops)
const OWNER = SHOPS({ shop_id: 's1', name: 'Asha Stores', role: 'owner' })
const nav = () => screen.getByRole('navigation', { name: 'Main' })

test('destinations are grouped by task and New invoice is one click from anywhere', async () => {
  fakeApi([...SIGNED_IN, OWNER])
  renderApp('/customers')
  await screen.findByRole('navigation', { name: 'Main' })
  for (const group of ['Sales', 'Inventory', 'Business', 'Administration']) expect(within(nav()).getByRole('button', { name: group })).toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: 'New invoice' })[0]).toHaveAttribute('href', '/billing/new')
  expect(within(nav()).getByRole('link', { name: 'Customers' })).toHaveAttribute('aria-current', 'page')
  expect(document.title).toBe('Customers · Storely')
})

test('a group can be collapsed and stays collapsed, but the group you are in never hides', async () => {
  fakeApi([...SIGNED_IN, OWNER])
  const first = renderApp('/products')
  await screen.findByRole('navigation', { name: 'Main' })
  await userEvent.click(within(nav()).getByRole('button', { name: 'Business' }))
  expect(within(nav()).queryByRole('link', { name: 'Expenses' })).not.toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem('storely.nav.collapsed')!)).toEqual(['business'])
  first.unmount()

  fakeApi([...SIGNED_IN, OWNER])
  renderApp('/products')
  await screen.findByRole('navigation', { name: 'Main' })
  expect(within(nav()).queryByRole('link', { name: 'Expenses' })).not.toBeInTheDocument()
  expect(within(nav()).getByRole('button', { name: 'Business' })).toHaveAttribute('aria-expanded', 'false')
})

test('the sidebar can be made compact; every destination keeps its name', async () => {
  fakeApi([...SIGNED_IN, OWNER])
  renderApp('/')
  const toggle = await screen.findByRole('button', { name: 'Collapse sidebar' })
  await userEvent.click(toggle)
  expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-pressed', 'true')
  expect(localStorage.getItem('storely.sidebar.compact')).toBe('true')
  expect(within(nav()).getByRole('link', { name: 'Products' })).toHaveAttribute('title', 'Products')
})

test('the account menu holds profile, appearance and sign out, and closes on Escape', async () => {
  fakeApi([...SIGNED_IN, OWNER])
  renderApp('/')
  const account = await screen.findByRole('button', { name: /Asha|a@b\.c/ })
  expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  await userEvent.click(account)
  const menu = screen.getByRole('group', { name: 'Account menu' })
  expect(within(menu).getByRole('link', { name: 'Account settings' })).toHaveAttribute('href', '/account')
  expect(within(menu).getByLabelText('Appearance')).toBeInTheDocument()
  expect(within(menu).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('group', { name: 'Account menu' })).not.toBeInTheDocument())
})

test('two shops with one name can be told apart in the switcher', async () => {
  fakeApi([...SIGNED_IN, SHOPS({ shop_id: 'aaaa-1111', name: 'abcd', role: 'owner' }, { shop_id: 'bbbb-2222', name: 'abcd', role: 'owner' }, { shop_id: 'cccc-3333', name: 'Other', role: 'owner' })])
  renderApp('/')
  const select = await screen.findByLabelText('Shop', { selector: 'select' })
  expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['abcd · 1111', 'abcd · 2222', 'Other'])
})
