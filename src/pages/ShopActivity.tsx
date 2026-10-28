import { PageHeader } from '../components/workspace'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { ShopEvent } from '../api/types'
import { Alert, Empty, Loading } from '../components/ui'
import { when } from '../components/format'
import { useShop } from '../shops/context'

export function ShopActivity() {
  const { current } = useShop()
  const shopId = current?.shop_id ?? ''
  const events = useQuery({ queryKey: ['shop-events', shopId], queryFn: () => api.get<ShopEvent[]>(`/v1/shops/${shopId}/security-events`), enabled: !!shopId })
  return (
    <div>
      <PageHeader eyebrow="WORKSPACE HISTORY" title="Shop activity" description="Sign-ins, role changes and invitations for this shop." />
      {events.isPending && <Loading />}
      {events.error && <Alert>Could not load activity. <button className="link" onClick={() => void events.refetch()}>Retry activity</button></Alert>}
      {events.data?.length === 0 && <Empty title="Nothing yet" />}
      {!!events.data?.length && (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>When</th><th>Event</th></tr></thead>
          <tbody>
            {events.data.map((e) => (
              <tr key={e.id}><td>{when(e.created_at)}</td><td>{e.event.replaceAll('_', ' ')}</td></tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  )
}
