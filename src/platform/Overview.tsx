import { QueryState } from './Bits'
import { Card } from '../components/ui/ui'
import { PageHeader, Button } from '../components/ui/workspace'
import { date, usePlatform, type Schemas } from './shared'

export function PlatformOverview() {
  const q = usePlatform<Schemas['PlatformKpisOut']>('/kpis')
  const stats = q.data
  return <><PageHeader eyebrow="DEVELOPER CONSOLE" title="Platform overview" description="Cloud shops and premium operations." actions={<Button onClick={() => void q.refetch()}>Refresh</Button>} /><QueryState pending={q.isPending} error={q.error} retry={() => void q.refetch()} />
    {stats && !q.error && <><p className="muted">As of {date(stats.as_of)}</p><div className="platform-kpis">{([
      ['Registered shops', stats.registered_shops, 'Non-deleted shops registered with the API. Offline-only shops are unknown.'],
      ['Active premium', stats.active_premium, 'Active subscriptions whose start has passed and end is in the future.'],
      ['Request backlog', stats.request_backlog, 'Pending and contacted requests awaiting a decision.'],
      ['Expiring within 7 days', stats.expiring_7d, 'Currently active premium ending in the next seven days.'],
      ['Expired', stats.expired, 'Explicitly expired or active subscriptions past their end date.'],
      ['Suspended', stats.suspended, 'Subscriptions manually suspended by a developer.'],
      ['Scheduled', stats.scheduled, 'Active subscriptions whose start is in the future.'],
      ['Synced in 24 hours', stats.synced_24h, 'Distinct shops with a completed pull or a push without rejected rows in the last 24 hours.'],
    ] as const).map(([label, value, hint]) => <Card key={label} title={label}><strong className="platform-number">{value}</strong><p className="muted">{hint}</p></Card>)}</div><Card title="Oldest open request"><p>{date(stats.oldest_request_at)}</p><p className="muted">Earliest submission still pending or contacted. Approved requests await activation on the owner’s phone. Sync activity starts with this release; it is not an uptime or error-rate metric.</p></Card></>}
  </>
}
