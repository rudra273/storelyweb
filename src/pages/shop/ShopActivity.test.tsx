import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { SIGNED_IN, fakeApi, ok, renderApp } from '../../test-utils'

afterEach(() => vi.unstubAllGlobals())

const SHOP = ok('GET', '/v1/shops', [{ shop_id: 's1', name: 'Asha Stores', role: 'owner' }])

test('Shop activity shows business changes by area and switches to team security events', async () => {
  const calls = fakeApi([
    ...SIGNED_IN,
    SHOP,
    ok('GET', /^\/v1\/shops\/s1\/audit-events\?/, {
      items: [
        {
          uuid: 'a1',
          entity_type: 'stock',
          entity_uuid: 'p1',
          action: 'adjusted',
          details: 'Sugar: 10 -> 8 (damage)',
          actor: 'owner@example.com',
          device_id: 'web',
          created_at: '2026-10-15T10:00:00.000Z',
        },
      ],
      has_more: false,
    }),
    ok('GET', '/v1/shops/s1/security-events', [
      {
        id: 1,
        user_id: 'u1',
        event: 'member_invited',
        details: {},
        created_at: '2026-10-14T10:00:00.000Z',
      },
    ]),
  ])

  renderApp('/activity')
  expect(await screen.findByText('Sugar: 10 -> 8 (damage)')).toBeInTheDocument()
  expect(screen.getByText('owner@example.com')).toBeInTheDocument()

  await userEvent.selectOptions(screen.getByLabelText('Area'), 'stock')
  expect(calls.some(c => c.path.includes('entity_type=stock'))).toBe(true)

  await userEvent.click(screen.getByRole('tab', { name: 'Team & security' }))
  expect(await screen.findByText('member invited')).toBeInTheDocument()
})
