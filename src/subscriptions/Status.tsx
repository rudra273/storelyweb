import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useNavigate } from 'react-router'
import { api } from '../api/client'
import type { components } from '../api/schema'
import { useShop } from '../shops/context'
import { rememberShop } from '../shops/selection'
import { useShopAccess } from './context'
import { Alert, Card, Empty, Loading } from '../components/ui/ui'
import { Button, PageHeader } from '../components/ui/workspace'
import { Status } from './display'
import { date } from './format'
import { describeError } from '../components/useAction'

export function RequestStatus({ compact = false }: { compact?: boolean }) {
  const query = useQuery({ queryKey: ['my-premium-requests'], queryFn: () => api.get<components['schemas']['MyPremiumRequestOut'][]>('/v1/me/premium-requests'), retry: false })
  return <Card title="Your premium requests">{query.isPending && <Loading />}{query.error && <Alert>{describeError(query.error)} <Button onClick={() => void query.refetch()}>Retry request status</Button></Alert>}{query.data && !query.error && <>{query.data.length === 0 ? compact ? <div className="onboarding-request-empty"><p><strong>No requests yet</strong></p><p className="muted">Submit a web request to track it here. Android requests stay on your phone until approval links your account.</p></div> : <Empty title="No account-bound requests yet">Submit a web request to track it here. Pending requests submitted on Android stay on that phone until approval binds your verified account.</Empty> : <ul className="plain">{query.data.map(r => <li key={r.id}><strong>{r.shop_name}</strong> · <Status value={r.status} />
    <p>{r.status === 'pending' || r.status === 'contacted' ? 'Our team will contact you using the phone number you provided. Approval is still pending.' : r.status === 'rejected' ? 'This request was declined. Contact our team for help.' : r.status === 'approved' ? r.request_kind === 'new_cloud' ? 'Approved. Confirm below to activate your new cloud shop.' : 'Awaiting activation: sign in with this account on the original Android phone, open your premium request, then back up and consent to upload.' : 'Activated. Select this shop to check its current subscription.'}</p>
    <p className="muted">{date(r.starts_at)} → {date(r.ends_at)}</p>
    {r.channel === 'web' && r.request_kind === 'new_cloud' && r.status === 'approved' && <ActivateWeb requestId={r.id} />}
  </li>)}</ul>}<Button onClick={() => void query.refetch()}>Refresh request status</Button></>}</Card>
}
function ActivateWeb({requestId}:{requestId:string}) {
  const [confirmed,setConfirmed]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const client=useQueryClient()
  const navigate=useNavigate()
  async function activate() {
    setBusy(true);setError(null)
    try {
      const activated = await api.post<components['schemas']['RequestOut']>(`/v1/me/premium-requests/${requestId}/activate`,{confirm_new_shop:true})
      rememberShop(activated.local_shop_id)
      await client.invalidateQueries({queryKey:['shops']})
      navigate('/')
      void client.invalidateQueries({queryKey:['my-premium-requests']})
    } catch(e) {setError(describeError(e))} finally {setBusy(false)}
  }
  return <div>{error && <Alert>{error}</Alert>}<label className="check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={busy} />Create a new empty cloud shop. I am not transferring an existing Android shop.</label><Button variant="primary" onClick={()=>void activate()} disabled={busy || !confirmed}>{busy?'Activating…':'Activate new web shop'}</Button></div>
}
export function SubscriptionStatus() {
  const { current, role } = useShop()
  const access = useShopAccess()
  const state = access.entitlement
  return <><PageHeader eyebrow="STORELY PREMIUM" title="Cloud subscription" description={`${current?.name ?? 'Your shop'} · Cloud sync and web access`} actions={<Button onClick={access.refresh}>Refresh access</Button>} />
    {access.pending ? <Loading label="Checking subscription…" /> : access.error ? <Alert>{describeError(access.error)} Business screens stay closed until access can be verified.</Alert> : <Card title={access.active ? 'Premium is active' : state?.effective_status === 'expired' ? 'Your subscription has expired' : state?.effective_status === 'suspended' ? 'Your subscription is suspended' : state?.effective_status === 'scheduled' ? 'Premium starts soon' : 'Premium is required for web access'}>{!access.active && <Status value={state?.effective_status ?? 'unavailable'} />}<p>Premium interval: {date(state?.starts_at)} → {date(state?.ends_at)}</p>{access.active ? <p><Link to="/">Open your workspace</Link></p> : <p>Free Storely works independently on Android. Your phone’s records and retained cloud records are not deleted when access stops.</p>}<p>{role === 'owner' ? 'For first activation, request Premium from Store → Cloud Backup & Sync on Android. For renewal, extension or a suspension review, contact the Storely team; a developer updates your existing shop subscription. Do not create another shop or upload a duplicate.' : 'Ask your shop owner to arrange activation or renewal with the Storely team.'}</p><p className="muted">No automatic payment or renewal is enabled. Approval alone does not upload phone data.</p></Card>}
    {!access.active && <p><Link to="/request-premium">Request Premium from the web</Link></p>}
    <RequestStatus />
  </>
}
export function RequirePaid() {
  const access = useShopAccess()
  // While the check is in flight, wait quietly; showing the subscription page here
  // flashes it at every paying shop right after sign-in.
  if (access.pending) return <Loading label="Opening your workspace…" />
  return access.active ? <Outlet /> : <SubscriptionStatus />
}
