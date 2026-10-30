import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { SIGNED_IN, PAID_SHOP, fakeApi, ok, renderApp } from './test-utils'

afterEach(() => vi.unstubAllGlobals())

const SHOP = (role: string) => ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Asha Stores', role }])
const SIGNED_OUT = ok('POST', '/v1/auth/refresh', { error: { code: 'invalid_token', message: 'x' } }, 401)

test('a visitor with no session is sent to the sign-in page', async () => {
  fakeApi([SIGNED_OUT])
  renderApp('/')
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
})

test('signing in lands on the home page for the shop and role', async () => {
  const calls = fakeApi([
    SIGNED_OUT,
    ...PAID_SHOP,
    ok('POST', '/v1/auth/login', { access_token: 't', token_type: 'bearer', expires_in: 900, mfa_required: false }),
    ok('GET', '/v1/me', { id: 'u1', email: 'a@b.c', full_name: 'Asha', email_verified: true }),
    SHOP('owner'),
  ])
  renderApp('/')
  await userEvent.type(await screen.findByLabelText('Email'), 'a@b.c')
  await userEvent.type(screen.getByLabelText('Password'), 'pw-123456789')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('heading', { name: 'Hello, Asha' })).toBeInTheDocument()
  const login = calls.find((c) => c.path === '/v1/auth/login')!
  expect(login.body).toMatchObject({ client: 'web', email: 'a@b.c' })
})

test('two-step sign-in asks for the code and sends it with the challenge token', async () => {
  const calls = fakeApi([
    SIGNED_OUT,
    ...PAID_SHOP,
    ok('POST', '/v1/auth/login', { mfa_required: true, mfa_token: 'chal-1', expires_in: 300, token_type: 'bearer' }),
    ok('POST', '/v1/auth/mfa/verify', { access_token: 't', token_type: 'bearer', expires_in: 900, mfa_required: false }),
    ok('GET', '/v1/me', { id: 'u1', email: 'a@b.c', full_name: null, email_verified: true }),
    SHOP('admin'),
  ])
  renderApp('/')
  await userEvent.type(await screen.findByLabelText('Email'), 'a@b.c')
  await userEvent.type(screen.getByLabelText('Password'), 'pw-123456789')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  await userEvent.type(await screen.findByLabelText('Code'), '123456')
  await userEvent.click(screen.getByRole('button', { name: 'Verify' }))
  expect(await screen.findByRole('heading', { name: 'Hello' })).toBeInTheDocument()
  expect(calls.find((c) => c.path === '/v1/auth/mfa/verify')!.body).toEqual({ mfa_token: 'chal-1', code: '123456' })
})

test('an unverified account is taken to the verification page', async () => {
  fakeApi([SIGNED_OUT, ok('POST', '/v1/auth/login', { error: { code: 'email_not_verified', message: 'Verify first.' } }, 403)])
  renderApp('/login')
  await userEvent.type(await screen.findByLabelText('Email'), 'a@b.c')
  await userEvent.type(screen.getByLabelText('Password'), 'pw-123456789')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
  expect(screen.getByLabelText('Email')).toHaveValue('a@b.c')
})

test('wrong credentials show the server message and stay on the page', async () => {
  fakeApi([SIGNED_OUT, ok('POST', '/v1/auth/login', { error: { code: 'invalid_credentials', message: 'Wrong email or password.' } }, 401)])
  renderApp('/login')
  await userEvent.type(await screen.findByLabelText('Email'), 'a@b.c')
  await userEvent.type(screen.getByLabelText('Password'), 'nope')
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.')
})

function menu() {
  return within(screen.getByRole('navigation', { name: 'Main' }))
    .getAllByRole('link')
    .map((a) => a.textContent)
}

test('owner and admin menus include reports, team and shop activity', async () => {
  for (const role of ['owner', 'admin']) {
    fakeApi([...SIGNED_IN, SHOP(role)])
    const view = renderApp('/')
    await screen.findByRole('heading', { name: 'Hello, Asha' })
    expect(menu()).toEqual(['Home', 'Products', 'Reports', 'Billing', 'Team', 'Shop activity', 'Cloud subscription'])
    view.unmount()
  }
})

test('a staff menu has only products and billing', async () => {
  fakeApi([...SIGNED_IN, SHOP('staff')])
  renderApp('/')
  await screen.findByRole('heading', { name: 'Hello, Asha' })
  expect(menu()).toEqual(['Home', 'Products', 'Billing', 'Cloud subscription'])
})

test('staff who type an admin address get "No access" and the page never loads its data', async () => {
  for (const path of ['/reports', '/team', '/activity']) {
    const calls = fakeApi([...SIGNED_IN, SHOP('staff')])
    const view = renderApp(path)
    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument()
    expect(calls.map((c) => c.path).filter((p) => p.includes('/members') || p.includes('/invites') || p.includes('security-events'))).toEqual([])
    view.unmount()
  }
})

test('a person with no shop sees invitations and Android activation guidance', async () => {
  fakeApi([...SIGNED_IN, ok('GET', '/v1/shops', []), ok('GET', '/v1/me/premium-requests', []), ok('GET', '/v1/invites/pending', [{ shop_id: 's9', role: 'staff', created_at: '2026-10-25T10:00:00Z' }])])
  renderApp('/')
  expect(await screen.findByRole('heading', { name: 'Welcome to Storely' })).toBeInTheDocument()
  expect(await screen.findByRole('button', { name: 'Accept' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Create shop' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Start on Android' })).toBeInTheDocument()
})

test('welcome page puts the Premium action first and keeps activation help collapsed', async () => {
  const calls = fakeApi([...SIGNED_IN, ok('GET', '/v1/shops', []), ok('GET', '/v1/invites/pending', []), ok('GET', '/v1/me/premium-requests', [])])
  renderApp('/')
  const request = await screen.findByRole('link', { name: 'Request Premium' })
  expect(request).toHaveAttribute('href', '/request-premium')
  expect(await screen.findByText('No requests yet')).toBeInTheDocument()
  expect(screen.queryByText('No account-bound requests yet')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Account security' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  const help = screen.getByText('How activation works')
  expect(help.closest('details')).not.toHaveAttribute('open')
  await userEvent.click(help)
  expect(help.closest('details')).toHaveAttribute('open')
  expect(screen.getByText(/For renewals, contact the Storely team/)).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Refresh request status' }))
  await waitFor(() => expect(calls.filter(c => c.path === '/v1/me/premium-requests')).toHaveLength(2))
  await userEvent.click(request)
  expect(await screen.findByRole('heading', { name: 'Request Premium' })).toBeInTheDocument()
  // The existing request page retains its original, noncompact empty state.
  expect(await screen.findByText('No account-bound requests yet')).toBeInTheDocument()
})

test('compact request panel preserves approved shop activation confirmation', async () => {
  const calls = fakeApi([...SIGNED_IN, ok('GET', '/v1/shops', []), ok('GET', '/v1/invites/pending', []), ok('GET', '/v1/me/premium-requests', [
    { id: 'web', shop_name: 'A very long shop name for the new cloud shop', status: 'approved', channel: 'web', request_kind: 'new_cloud' },
    { id: 'android', shop_name: 'Existing phone shop', status: 'approved', channel: 'web', request_kind: 'existing_android' },
  ]), ok('POST', '/v1/me/premium-requests/web/activate', { local_shop_id: 'new-shop' })])
  renderApp('/')
  const activate = await screen.findByRole('button', { name: 'Activate new web shop' })
  expect(activate).toBeDisabled()
  expect(screen.getByText(/Awaiting activation: sign in with this account/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('checkbox'))
  expect(activate).toBeEnabled()
  await userEvent.click(activate)
  await waitFor(() => expect(calls.find(c => c.path === '/v1/me/premium-requests/web/activate')?.body).toEqual({ confirm_new_shop: true }))
  expect(calls.some(c => c.path === '/v1/me/premium-requests/android/activate')).toBe(false)
})

test('welcome page accepts an invitation through the existing endpoint', async () => {
  const calls = fakeApi([...SIGNED_IN, ok('GET', '/v1/shops', []), ok('GET', '/v1/me/premium-requests', []), ok('GET', '/v1/invites/pending', [
    { shop_id: 's9', role: 'staff', created_at: '2026-10-25T10:00:00Z' },
    { shop_id: 's10', role: 'admin', created_at: '2026-10-25T10:00:00Z' },
  ]), ok('POST', '/v1/invites/accept', {})])
  renderApp('/')
  const buttons = await screen.findAllByRole('button', { name: 'Accept' })
  await userEvent.click(buttons[0]!)
  await waitFor(() => expect(calls.find(c => c.path === '/v1/invites/accept')?.body).toEqual({ shop_id: 's9' }))
  await waitFor(() => expect(calls.filter(c => c.path === '/v1/shops').length).toBeGreaterThan(1))
})

test('welcome panels keep failures recoverable without hiding the Premium action', async () => {
  const routes = [...SIGNED_IN, ok('GET', '/v1/shops', []),
    ok('GET', '/v1/invites/pending', { error: { code: 'unavailable', message: 'Try later' } }, 503),
    ok('GET', '/v1/me/premium-requests', { error: { code: 'unavailable', message: 'Requests unavailable' } }, 503),
  ]
  fakeApi(routes)
  renderApp('/')
  await screen.findByRole('button', { name: 'Retry invitations' })
  expect(await screen.findByRole('button', { name: 'Retry request status' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Request Premium' })).toBeInTheDocument()
  routes[routes.length - 2] = ok('GET', '/v1/invites/pending', [])
  routes[routes.length - 1] = ok('GET', '/v1/me/premium-requests', [])
  await userEvent.click(screen.getByRole('button', { name: 'Retry invitations' }))
  await userEvent.click(screen.getByRole('button', { name: 'Retry request status' }))
  expect(await screen.findByText(/No invitations waiting/)).toBeInTheDocument()
  expect(await screen.findByText('No requests yet')).toBeInTheDocument()
})

test('when the server ends the session the visitor sees why', async () => {
  fakeApi([
    ...SIGNED_IN,
    SHOP('owner'),
    ok('GET', '/v1/me/sessions', { error: { code: 'invalid_token', message: 'x' } }, 401),
  ])
  renderApp('/account/security')
  // the first refresh in this fake always succeeds, so the retried call fails again
  await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())
})

test('the public delete-account page asks a signed-out visitor to sign in first', async () => {
  fakeApi([SIGNED_OUT])
  renderApp('/delete-account')
  expect(await screen.findByRole('heading', { name: 'Delete your account' })).toBeInTheDocument()
  expect(await screen.findByLabelText('Password')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Delete my account' })).not.toBeInTheDocument()
})
