import type { Role } from './api/types'

/**
 * What each role may see on the web (plan.md 4.5). This only decides what the screens
 * show; the server enforces the same rules on every request, so hiding a menu item is
 * convenience and never the protection.
 */
export type Capability =
  | 'products.view'
  | 'products.edit'
  | 'customers.view'
  | 'billing.create'
  | 'billing.cancel'
  | 'reports.view'
  | 'data.export'
  | 'team.manage'
  | 'shop.settings'
  | 'shop.events'

const STAFF: Capability[] = ['products.view', 'customers.view', 'billing.create']
const ADMIN: Capability[] = [
  ...STAFF,
  'products.edit',
  'billing.cancel',
  'reports.view',
  'data.export',
  'team.manage',
  'shop.settings',
  'shop.events',
]

const MATRIX: Record<Role, ReadonlySet<Capability>> = {
  owner: new Set(ADMIN),
  admin: new Set(ADMIN),
  staff: new Set(STAFF),
}

function isRole(value: string | null | undefined): value is Role {
  return value === 'owner' || value === 'admin' || value === 'staff'
}

/** An unknown or missing role gets nothing. */
export function can(role: string | null | undefined, capability: Capability): boolean {
  return isRole(role) && MATRIX[role].has(capability)
}

export interface NavItem {
  to: string
  label: string
  needs: Capability
}

export const NAV: NavItem[] = [
  { to: '/products', label: 'Products', needs: 'products.view' },
  { to: '/reports', label: 'Reports', needs: 'reports.view' },
  { to: '/billing', label: 'Billing', needs: 'billing.create' },
  { to: '/team', label: 'Team', needs: 'team.manage' },
  { to: '/activity', label: 'Shop activity', needs: 'shop.events' },
]
