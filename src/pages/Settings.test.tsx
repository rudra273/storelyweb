import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { SIGNED_IN, fakeApi, ok, renderApp } from '../test-utils'

afterEach(() => vi.unstubAllGlobals())
const shop = ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Asha Stores', role: 'owner' }])

test('team invitation failures are visible and retryable', async () => {
  const calls = fakeApi([...SIGNED_IN, shop, ok('GET', '/v1/shops/s1/members', []), ok('GET', '/v1/shops/s1/invites', { error: { message: 'Unavailable' } }, 500)])
  renderApp('/team')
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load invitations')
  const before = calls.filter(c => c.path.endsWith('/invites')).length
  await userEvent.click(screen.getByRole('button', { name: 'Retry invitations' }))
  await waitFor(() => expect(calls.filter(c => c.path.endsWith('/invites')).length).toBeGreaterThan(before))
  expect(screen.queryByText('No open invitations')).not.toBeInTheDocument()
})

test('a successful invitation gives confirmation and clears the email', async () => {
  const calls = fakeApi([...SIGNED_IN, shop, ok('GET', '/v1/shops/s1/members', []), ok('GET', '/v1/shops/s1/invites', []), ok('POST', '/v1/shops/s1/invites', {})])
  renderApp('/team')
  await userEvent.type(await screen.findByLabelText('Invite by email'), 'staff@example.com')
  await userEvent.click(screen.getByRole('button', { name: 'Send invitation' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Invitation sent')
  expect(screen.getByLabelText('Invite by email')).toHaveValue('')
  expect(calls.find(c => c.method === 'POST' && c.path.endsWith('/invites'))?.body).toEqual({ email: 'staff@example.com', role: 'staff' })
})

test('profile navigation exposes security and saving shows confirmation', async () => {
  fakeApi([...SIGNED_IN, shop, ok('PATCH', '/v1/me', {})])
  renderApp('/account')
  expect(await screen.findByRole('navigation', { name: 'Account settings' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute('href', '/account/security')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Saved.')
})
