import { expect, test } from 'vitest'
import { NAV, can, type Capability } from './permissions'

const ALL: Capability[] = [
  'products.view', 'products.edit', 'customers.view', 'billing.create', 'billing.cancel',
  'reports.view', 'data.export', 'team.manage', 'shop.settings', 'shop.events',
]

test('staff can look things up and bill, nothing more', () => {
  const allowed = ALL.filter((c) => can('staff', c))
  expect(allowed).toEqual(['products.view', 'customers.view', 'billing.create'])
})

test('owner and admin have the same screens', () => {
  expect(ALL.filter((c) => can('owner', c))).toEqual(ALL)
  expect(ALL.filter((c) => can('admin', c))).toEqual(ALL)
})

test('an unknown, empty or tampered role gets nothing', () => {
  for (const role of [null, undefined, '', 'superuser', 'OWNER', 'owner ']) {
    expect(ALL.filter((c) => can(role, c))).toEqual([])
  }
})

test('staff never see reports, team or shop activity in the menu', () => {
  const labels = NAV.filter((item) => can('staff', item.needs)).map((item) => item.label)
  expect(labels).toEqual(['Products', 'Billing'])
})
