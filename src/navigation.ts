import { can, type Capability } from './permissions'
import { SALES } from './lib/vocabulary'

/**
 * The one definition of where things live. The sidebar, breadcrumbs, page titles and the
 * Home shortcuts all read it, so a label can never differ between them.
 * Labels follow the naming guide in refractor.md (sentence case, one word per concept).
 */
export interface Destination {
  to: string
  label: string
  /** Hidden from roles without this capability. The API enforces the same rule. */
  needs?: Capability
  /** Key into the icon set. */
  icon: string
  /** One line for the Home shortcuts. */
  blurb?: string
  /** The route matches only exactly (the dashboard). */
  end?: boolean
}

export interface NavGroup {
  id: string
  label: string
  items: Destination[]
}

export const NEW_INVOICE: Destination = { to: '/billing/new', label: SALES.newInvoice, needs: 'billing.create', icon: 'plus' }

export const NAV_GROUPS: NavGroup[] = [
  { id: 'overview', label: 'Overview', items: [
    { to: '/', label: 'Dashboard', icon: 'home', end: true },
  ] },
  { id: 'sales', label: 'Sales', items: [
    { to: '/billing', label: 'Invoices', needs: 'billing.create', icon: 'invoice', blurb: 'Create an invoice, record a payment or find a past sale.' },
    { to: '/customers', label: 'Customers', needs: 'customers.view', icon: 'customers', blurb: 'See who owes you money and collect it.' },
  ] },
  { id: 'inventory', label: 'Inventory', items: [
    { to: '/products', label: 'Products', needs: 'products.view', icon: 'products', blurb: 'Find products, check stock and keep your catalogue up to date.' },
  ] },
  { id: 'purchases', label: 'Purchases', items: [
    { to: '/purchases', label: 'Purchase invoices', needs: 'products.edit', icon: 'purchases', blurb: 'Record stock you receive and see what each purchase cost.' },
    { to: '/suppliers', label: 'Suppliers', needs: 'products.edit', icon: 'suppliers', blurb: 'Who you buy from and what you still owe them.' },
  ] },
  { id: 'business', label: 'Business', items: [
    { to: '/expenses', label: 'Expenses', needs: 'expenses.manage', icon: 'expenses', blurb: 'Record rent, salaries and other running costs.' },
    { to: '/reports', label: 'Reports', needs: 'reports.view', icon: 'reports', blurb: 'Understand sales, profit and outstanding payments.' },
    // Only membership events are recorded today, so the name says so (refractor.md naming guide).
    { to: '/activity', label: 'Team activity', needs: 'shop.events', icon: 'activity', blurb: 'Review who joined, left or changed role.' },
  ] },
  { id: 'administration', label: 'Administration', items: [
    { to: '/settings', label: 'Shop settings', needs: 'shop.settings', icon: 'settings', blurb: 'Shop details, tax and how invoices look.' },
    { to: '/team', label: 'Team & permissions', needs: 'team.manage', icon: 'team', blurb: 'Invite your team and manage their access.' },
    { to: '/subscription', label: 'Subscription', icon: 'subscription' },
  ] },
]

export const ALL_DESTINATIONS: Destination[] = NAV_GROUPS.flatMap(g => g.items)

/** What this role may open. Without active access only the dashboard and Subscription remain. */
export function visibleGroups(role: string | null | undefined, hasAccess: boolean): NavGroup[] {
  return NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => (hasAccess || i.to === '/' || i.to === '/subscription') && (!i.needs || can(role, i.needs))) }))
    .filter(g => g.items.length > 0)
}

export interface RouteMeta {
  group: NavGroup | null
  item: Destination | null
  /** Breadcrumb labels after "Workspace". */
  crumbs: string[]
  title: string
}

function matches(item: Destination, pathname: string): boolean {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)
}

export function routeMeta(pathname: string): RouteMeta {
  if (pathname.startsWith('/account')) return { group: null, item: null, crumbs: ['Your account'], title: 'Your account' }
  const group = NAV_GROUPS.find(g => g.items.some(i => matches(i, pathname))) ?? null
  const item = group?.items.find(i => matches(i, pathname)) ?? null
  const crumbs = [group?.label, item?.label].filter((x): x is string => !!x)
  if (pathname === NEW_INVOICE.to) crumbs.push(NEW_INVOICE.label)
  const last = crumbs[crumbs.length - 1] ?? 'Dashboard'
  return { group, item, crumbs: crumbs.length ? crumbs : ['Dashboard'], title: `${last} · Storely` }
}
