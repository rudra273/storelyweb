import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useConfirmLeave } from '../../lib/dirty'
import { usePersisted } from '../../lib/usePersisted'
import { NEW_INVOICE, routeMeta, visibleGroups, type NavGroup } from '../../navigation'
import { can } from '../../permissions'
import { useShop } from '../../shops/context'
import { shopLabel } from '../../shops/label'
import { useShopAccess } from '../../subscriptions/context'
import { OfflineBanner } from '../ui/states'
import { WorkspaceThemeBinding } from '../../theme/WorkspaceThemeBinding'
import { AccountMenu } from './AccountMenu'
import { NavIcon } from './NavIcon'

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')
const isFlag = (v: unknown): v is boolean => typeof v === 'boolean'

export function AppLayout() {
  const { shops, current, role, select } = useShop()
  const { active, pending } = useShopAccess()
  const confirmLeave = useConfirmLeave()
  const { pathname } = useLocation()
  const meta = routeMeta(pathname)
  const groups = visibleGroups(role, active || pending)
  const [compact, setCompact] = usePersisted('storely.sidebar.compact', false, isFlag)
  const [collapsed, setCollapsed] = usePersisted<string[]>('storely.nav.collapsed', [], isStrings)
  const [open, setOpen] = useState(false)
  // Choosing a destination closes the drawer.
  const [shownAt, setShownAt] = useState(pathname)
  if (shownAt !== pathname) { setShownAt(pathname); setOpen(false) }
  const toggle = useRef<HTMLButtonElement>(null)
  const drawer = useRef<HTMLDivElement>(null)

  useEffect(() => { document.title = meta.title }, [meta.title])
  useEffect(() => {
    if (!open) return
    drawer.current?.querySelector<HTMLElement>('a, button, select')?.focus()
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); toggle.current?.focus() } }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [open])

  const switchShop = (id: string) => {
    if (confirmLeave('Switch shop? Changes you have not saved in this shop will be lost.')) select(id)
  }
  const currentLabel = current ? shopLabel(current, shops) : ''

  return (
    <div className="shell" data-compact={compact}><WorkspaceThemeBinding /><a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar" data-open={open}>
        <div className="sidebar-top">
          <span className="brand"><img className="brand-mark" src="/storely-icon.png" alt="" /><span className="brand-word"><span>Store<span className="brand-accent">ly</span></span><span className="brand-dot">.</span></span></span>
          <button className="compact-toggle" aria-pressed={compact} aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCompact(!compact)} title={compact ? 'Expand sidebar' : 'Collapse sidebar'}>
            <NavIcon name={compact ? 'expand' : 'collapse'} />
          </button>
          <button ref={toggle} className="menu-toggle" aria-expanded={open} aria-controls="workspace-navigation" onClick={() => setOpen(!open)}>
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
        <div className="sidebar-body" id="workspace-navigation" ref={drawer}>
          <div className="shop-context">
            <div className="shop-context-head"><span className="nav-caption nav-text">WORKSPACE</span>{role && <span className="role-badge nav-text">{role}</span>}</div>
            {shops.length > 1 ? (
              <label className="shop-switch">
                <span className="nav-text">Shop</span>
                <select aria-label="Shop" value={current?.shop_id ?? ''} title={currentLabel} onChange={e => switchShop(e.target.value)}>
                  {shops.map(s => <option key={s.shop_id} value={s.shop_id}>{shopLabel(s, shops)}</option>)}
                </select>
              </label>
            ) : (
              <p className="shop-name" title={currentLabel}>{current?.name}</p>
            )}
          </div>
          {(active || pending) && can(role, NEW_INVOICE.needs!) && (
            <Link className="new-invoice" to={NEW_INVOICE.to} title={NEW_INVOICE.label}>
              <NavIcon name={NEW_INVOICE.icon} /><span className="nav-text">{NEW_INVOICE.label}</span>
            </Link>
          )}
          <nav aria-label="Main" className="main-nav">
            {groups.map(group => <NavSection key={group.id} group={group} current={meta.group?.id === group.id}
              collapsed={collapsed.includes(group.id) && meta.group?.id !== group.id}
              onToggle={() => setCollapsed(collapsed.includes(group.id) ? collapsed.filter(id => id !== group.id) : [...collapsed, group.id])} />)}
          </nav>
          <div className="sidebar-foot">
            <AccountMenu />
          </div>
        </div>
      </aside>
      {open && <div className="drawer-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
      <div className="workspace"><OfflineBanner /><header className="workspace-header"><span>Workspace {meta.crumbs.map((c, i) => <span key={c}><span className="breadcrumb-divider">/</span>{i === meta.crumbs.length - 1 ? <strong aria-current="page">{c}</strong> : c}</span>)}</span><span className="workspace-shop" title={currentLabel}>{currentLabel}</span></header><main className="content" id="main-content" tabIndex={-1}><Outlet key={current?.shop_id} /></main></div>
    </div>
  )
}

function NavSection({ group, current, collapsed, onToggle }: { group: NavGroup; current: boolean; collapsed: boolean; onToggle: () => void }) {
  const id = `nav-group-${group.id}`
  // The dashboard stands alone, so it needs no heading to open or close.
  const single = group.id === 'overview'
  return <div className="nav-group" data-current={current}>
    {!single && <button className="nav-group-head nav-text" aria-expanded={!collapsed} aria-controls={id} onClick={onToggle}>
      <span>{group.label}</span><NavIcon name="chevron" className="chevron" />
    </button>}
    <div className="nav-group-items" id={id} hidden={collapsed && !single}>
      {group.items.map(item => <NavLink key={item.to} to={item.to} end={item.end || item.to === '/billing'} title={item.label}>
        <NavIcon name={item.icon} /><span className="nav-text">{item.label}</span>
      </NavLink>)}
    </div>
  </div>
}
