import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import type { Invite, Member } from '../api/types'
import { useAuth } from '../auth/context'
import { useAction } from '../components/useAction'
import { Alert, Card, Empty, Field, Loading } from '../components/ui'
import { when } from '../components/format'
import { useShop } from '../shops/context'

export function Team() {
  const { current, role } = useShop()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const shopId = current?.shop_id ?? ''
  const members = useQuery({ queryKey: ['members', shopId], queryFn: () => api.get<Member[]>(`/v1/shops/${shopId}/members`), enabled: !!shopId })
  const invites = useQuery({ queryKey: ['invites', shopId], queryFn: () => api.get<Invite[]>(`/v1/shops/${shopId}/invites`), enabled: !!shopId })
  const action = useAction()
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('staff')

  const reload = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['members', shopId] }), queryClient.invalidateQueries({ queryKey: ['invites', shopId] })])

  async function invite(e: FormEvent) {
    e.preventDefault()
    const ok = await action.run(async () => {
      await api.post(`/v1/shops/${shopId}/invites`, { email: email.trim(), role: inviteRole })
      return true
    })
    if (ok) {
      setEmail('')
      await reload()
    }
  }

  const change = async (memberId: string, newRole: string) => {
    if (await action.run(async () => { await api.patch(`/v1/shops/${shopId}/members/${memberId}`, { role: newRole }); return true })) await reload()
  }
  const remove = async (member: Member) => {
    if (!window.confirm(`Remove ${member.email} from this shop? They lose access immediately.`)) return
    if (await action.run(async () => { await api.delete(`/v1/shops/${shopId}/members/${member.user_id}`); return true })) await reload()
  }
  const cancelInvite = async (id: string) => {
    if (await action.run(async () => { await api.delete(`/v1/shops/${shopId}/invites/${id}`); return true })) await reload()
  }

  return (
    <div>
      <h1>Team</h1>
      {action.error && <Alert>{action.error}</Alert>}
      <Card title="People with access">
        {members.isPending && <Loading />}
        {members.error && <Alert>Could not load the team.</Alert>}
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Person</th><th>Role</th><th>Since</th><th /></tr></thead>
          <tbody>
            {members.data?.map((m) => {
              const mine = m.user_id === user?.id
              // Admins manage staff only; the server enforces this too.
              const editable = !mine && m.role !== 'owner' && (role === 'owner' || m.role === 'staff')
              return (
                <tr key={m.user_id}>
                  <td>{m.full_name || m.email}<br /><small className="muted">{m.email}{mine ? ' (you)' : ''}</small></td>
                  <td>
                    {editable && role === 'owner' ? (
                      <select aria-label={`Role of ${m.email}`} value={m.role} onChange={(e) => change(m.user_id, e.target.value)} disabled={action.busy}>
                        <option value="staff">staff</option>
                        <option value="admin">admin</option>
                      </select>
                    ) : m.role}
                  </td>
                  <td>{when(m.created_at)}</td>
                  <td>{editable && <button className="link danger" onClick={() => remove(m)} disabled={action.busy}>Remove</button>}</td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
      </Card>

      <Card title="Invitations waiting">
        {invites.data?.length === 0 && <Empty title="No open invitations" />}
        <ul className="plain">
          {invites.data?.map((i) => (
            <li key={i.id} className="row">
              <span>{i.email} as <strong>{i.role}</strong> <small className="muted">({when(i.created_at)})</small></span>
              <button className="link danger" onClick={() => cancelInvite(i.id)} disabled={action.busy}>Cancel</button>
            </li>
          ))}
        </ul>
        <form onSubmit={invite} noValidate className="inline-form">
          <Field label="Invite by email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {role === 'owner' && (
            <div className="field">
              <label htmlFor="invite-role">Role</label>
              <select id="invite-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                <option value="staff">staff</option>
                <option value="admin">admin</option>
              </select>
            </div>
          )}
          <button className="primary" disabled={action.busy || !email}>Send invitation</button>
        </form>
        <p className="muted">The person signs up (or signs in) with this email and accepts the invitation.</p>
      </Card>
    </div>
  )
}
