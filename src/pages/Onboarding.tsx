import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import type { MyInvite } from '../api/types'
import { useAction } from '../components/useAction'
import { Alert, Card, Field, Loading } from '../components/ui'
import { when } from '../components/format'
import { useShop } from '../shops/context'

/** Shown to a signed-in person who belongs to no shop yet. */
export function Onboarding() {
  const { refresh, select } = useShop()
  const queryClient = useQueryClient()
  const invites = useQuery({ queryKey: ['invites', 'pending'], queryFn: () => api.get<MyInvite[]>('/v1/invites/pending') })
  const accept = useAction()
  const create = useAction()
  const [name, setName] = useState('')

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

  async function createShop(e: FormEvent) {
    e.preventDefault()
    const made = await create.run(() => api.post<{ shop_id: string }>('/v1/shops', { name: name.trim() }))
    if (made) {
      await queryClient.invalidateQueries({ queryKey: ['shops'] })
      select(made.shop_id)
      await refresh()
    }
  }

  return (
    <div className="onboarding">
      <h1>Welcome to Storely</h1>
      <p>You are not part of a shop yet. Accept an invitation, or set up your own shop.</p>

      <Card title="Invitations for you">
        {invites.isPending && <Loading />}
        {invites.error && <Alert>Could not load invitations.</Alert>}
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

      <Card title="Start a new shop">
        <form onSubmit={createShop} noValidate>
          {create.error && <Alert>{create.error}</Alert>}
          <Field label="Shop name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          <button className="primary" disabled={create.busy || name.trim().length < 2}>
            {create.busy ? 'Creating…' : 'Create shop'}
          </button>
        </form>
      </Card>
    </div>
  )
}
