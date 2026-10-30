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
      <header className="onboarding-intro">
        <p className="eyebrow">LET’S GET STARTED</p>
        <h1>Welcome to Storely</h1>
        <p>Premium includes cloud sync and web access. Request access for your shop or accept an invitation.</p>
      </header>
      <div className="onboarding-grid">
        <section className="onboarding-premium" aria-labelledby="premium-title">
          <div className="onboarding-premium-top">
            <span className="onboarding-label">STORELY PREMIUM</span>
            <h2 id="premium-title">Your shop, on every screen.</h2>
            <p>Bring your Android shop to the web, or start a new web shop with Premium.</p>
            <ul className="onboarding-benefits">
              <li>Cloud backup &amp; sync</li>
              <li>Access from your laptop</li>
            </ul>
            <Link className="ui-button primary onboarding-cta" to="/request-premium">Request Premium <span aria-hidden="true">→</span></Link>
            <p className="onboarding-note">Our team reviews your request before activation.</p>
          </div>
          <div className="onboarding-android">
            <div className="onboarding-android-heading">
              <h2>Start on Android</h2>
              <a className="ui-button" href="https://play.google.com/store/apps/details?id=com.rudra.storely" target="_blank" rel="noopener noreferrer">Get the Android app <span aria-hidden="true">↗</span></a>
            </div>
            <p>Storely is free on your phone, with your data stored locally. Already have a shop? Keep using that same shop when you request Premium.</p>
            <details className="onboarding-help">
              <summary>How activation works</summary>
              <ol>
                <li>Request here, or on Android from <strong>Store → Cloud Backup &amp; Sync</strong>. Provide your contact phone and wait for our team to approve your verified account.</li>
                <li>For an existing Android shop, activate from the original phone after backing up and consenting to upload. Creating a new shop here will not activate your existing data.</li>
                <li>For a new web shop, confirm activation here after approval.</li>
              </ol>
              <p>For renewals, contact the Storely team to update your existing subscription. Do not create a duplicate shop.</p>
            </details>
          </div>
        </section>
        <div className="onboarding-panels">
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

          <RequestStatus compact />
        </div>
      </div>
    </div>
  )
}
