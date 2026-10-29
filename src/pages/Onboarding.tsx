import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { MyInvite } from '../api/types'
import { useAction } from '../components/useAction'
import { Alert, Card, Loading } from '../components/ui'
import { when } from '../components/format'
import { useShop } from '../shops/context'
import { RequestStatus } from '../subscriptions/Status'
import { Link } from 'react-router'

/** Shown to a signed-in person who belongs to no shop yet. */
export function Onboarding() {
  const { refresh, select } = useShop()
  const queryClient = useQueryClient()
  const invites = useQuery({ queryKey: ['invites', 'pending'], queryFn: () => api.get<MyInvite[]>('/v1/invites/pending') })
  const accept = useAction()

  async function acceptInvite(shopId: string) {
    const ok = await accept.run(async () => {
      await api.post('/v1/invites/accept', { shop_id: shopId })
      return true
    })
    if (ok) {
      await queryClient.invalidateQueries({ queryKey: ['shops'] })
      select(shopId)
      await refresh()
    }
  }

  return (
    <div className="onboarding">
      <p className="eyebrow">LET’S GET STARTED</p><h1>Welcome to Storely</h1>
      <p>Web access is included with Premium. Request it here for your Android shop or a new web shop, or accept an invitation.</p>

      <Card title="Invitations for you">
        {invites.isPending && <Loading />}
        {invites.error && <Alert>Could not load invitations. <button className="link" onClick={() => void invites.refetch()}>Retry invitations</button></Alert>}
        {accept.error && <Alert>{accept.error}</Alert>}
        {invites.data?.length === 0 && <p className="muted">No invitations waiting. Ask the shop owner to invite your email address.</p>}
        <ul className="plain">
          {invites.data?.map((invite) => (
            <li key={invite.shop_id} className="row">
              <span>
                Join as <strong>{invite.role}</strong> <small className="muted">(invited {when(invite.created_at)})</small>
              </span>
              <button className="primary" disabled={accept.busy} onClick={() => acceptInvite(invite.shop_id)}>
                Accept
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Start on Android">
        <p><Link to="/request-premium">Request Premium from the web</Link></p>
        <p>Use Storely free on your phone with all data stored locally. Request Premium from Store → Cloud Backup &amp; Sync, provide your contact phone, and wait for our team to approve your verified account.</p>
        <p>Then activate from that phone after backing up and consenting to upload. Creating another shop here would not activate your existing data.</p>
        <p>For renewals, contact the Storely team to update your existing subscription.</p>
        <Link to="/account/security">Account security</Link>
      </Card>
      <RequestStatus />
    </div>
  )
}
