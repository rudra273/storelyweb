import { expect, test } from 'vitest'
import { visibleGroups } from './navigation'
import { can, type Capability } from './permissions'

const ALL: Capability[] = [
  'products.view', 'products.edit', 'customers.view', 'billing.create', 'billing.cancel', 'expenses.manage',
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

test('staff never see reports, expenses, team, activity or settings in the menu', () => {
  const labels = visibleGroups('staff', true).flatMap(g => g.items.map(i => i.label))
  expect(labels).toEqual(['Dashboard', 'Invoices', 'Customers', 'Products', 'Subscription'])
})

test('owners see every group, and a shop without access only the dashboard and subscription', () => {
  expect(visibleGroups('owner', true).map(g => g.label)).toEqual(['Overview', 'Sales', 'Inventory', 'Business', 'Administration'])
  expect(visibleGroups('owner', false).flatMap(g => g.items.map(i => i.label))).toEqual(['Dashboard', 'Subscription'])
  expect(visibleGroups(null, true).flatMap(g => g.items.map(i => i.label))).toEqual(['Dashboard', 'Subscription'])
})
