import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../../api/client'
import { useAuth } from '../../auth/context'
import { useShop } from '../../shops/context'
import { can } from '../../permissions'
import { Alert, Loading } from '../../components/ui/ui'
import { formatMoney } from '../../lib/money'
import { today } from '../../reports/periods'
import { overdueAgeing } from '../../reports/overdue'
import type { Ageing, Expiring } from '../../reports/queries'

export function NeedsAction() {
  const user = useAuth().user?.id ?? ''
  const { current, role } = useShop()
  if (!can(role, 'reports.view')) return null
  return <Alerts key={`${user}/${current?.shop_id}`} user={user} shop={current?.shop_id ?? ''} />
}
function Alerts({ user, shop }: { user: string; shop: string }) {
  const day = today()
  const overdue = useQuery({ queryKey: ['report', shop, 'needs-action', user, 'receivables', day], queryFn: ({ signal }) => api.get<Ageing>(`/v1/shops/${encodeURIComponent(shop)}/reports/receivables-ageing?as_of=${day}`, { signal }), enabled: !!user && !!shop, retry: false })
  const expiry = useQuery({ queryKey: ['report', shop, 'needs-action', user, 'expiry'], queryFn: ({ signal }) => api.get<Expiring>(`/v1/shops/${encodeURIComponent(shop)}/reports/expiring-stock?days=7`, { signal }), enabled: !!user && !!shop, retry: false })
  const aged = overdue.data && !overdue.error ? overdueAgeing(overdue.data) : null
  const batches = expiry.data && !expiry.error ? expiry.data.batches : []
  const expired = batches.filter(batch => batch.expired).length
  const empty = !overdue.isPending && !expiry.isPending && !overdue.error && !expiry.error && !aged?.customers.length && !batches.length
  return <section className="card" aria-label="Needs action">
    <h2>Needs action</h2>
    {overdue.isPending && <Loading label="Checking overdue payments…" />}
    {overdue.error && <Alert>Overdue payments could not be checked. <button type="button" className="link" onClick={() => void overdue.refetch()}>Retry overdue alerts</button></Alert>}
    {!!aged?.customers.length && <p><Link to={`/reports/receivables?overdue=1&as_of=${day}`}>{aged.customers.length} customer{aged.customers.length === 1 ? ' owes' : 's owe'} for over 30 days · {formatMoney(aged.total)}</Link></p>}
    {expiry.isPending && <Loading label="Checking expiring stock…" />}
    {expiry.error && <Alert>Expiring stock could not be checked. <button type="button" className="link" onClick={() => void expiry.refetch()}>Retry expiry alerts</button></Alert>}
    {!!batches.length && <p><Link to="/reports/expiring?days=7">{expired ? `${expired} batch${expired === 1 ? '' : 'es'} expired` : `${batches.length} batch${batches.length === 1 ? ' expires' : 'es expire'} this week`}</Link></p>}
    {empty && <p className="muted">All caught up. No payments over 30 days or stock expiring within seven days.</p>}
  </section>
}
