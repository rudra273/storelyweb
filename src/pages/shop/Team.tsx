import { PageHeader } from '../../components/ui/workspace'
import { roleLabel } from '../../components/labels'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../../api/client'
import type { Invite, Member } from '../../api/types'
import { useAuth } from '../../auth/context'
import { useAction } from '../../components/useAction'
import { Alert, Card, Empty, Field, Loading } from '../../components/ui/ui'
import { when } from '../../components/format'
import { useShop } from '../../shops/context'

export function Team() {
  const { current, role } = useShop()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const shopId = current?.shop_id ?? ''
  const members = useQuery({ queryKey: ['members', shopId], queryFn: () => api.get<Member[]>(`/v1/shops/${shopId}/members`), enabled: !!shopId })
  const invites = useQuery({ queryKey: ['invites', shopId], queryFn: () => api.get<Invite[]>(`/v1/shops/${shopId}/invites`), enabled: !!shopId })
  const action = useAction()
  const [invited, setInvited] = useState(false)
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('staff')

  const reload = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['members', shopId] }), queryClient.invalidateQueries({ queryKey: ['invites', shopId] })])

  async function invite(e: FormEvent) {
    e.preventDefault()
    setInvited(false)
    const ok = await action.run(async () => {
      await api.post(`/v1/shops/${shopId}/invites`, { email: email.trim(), role: inviteRole })
      return true
    })
    if (ok) {
      setEmail('')
      setInvited(true)
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
    <div className="team-page">
      <PageHeader eyebrow="WORKSPACE ACCESS" title="Team & permissions" description="Bring your team together and manage who can access your shop." />
      {action.error && <Alert>{action.error}</Alert>}
      {invited && <Alert kind="success">Invitation sent. Your teammate can accept it when they sign in.</Alert>}
      <div className="team-grid"><div><Card title="People with access">
        {members.isPending && <Loading />}
        {members.error && <Alert>Could not load the team. <button className="link" onClick={() => void members.refetch()}>Retry team</button></Alert>}
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Person</th><th>Role</th><th className="hide-sm">Since</th><th /></tr></thead>
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
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : roleLabel(m.role)}
                  </td>
                  <td className="hide-sm">{when(m.created_at)}</td>
                  <td>{editable && <button className="link danger" onClick={() => remove(m)} disabled={action.busy}>Remove</button>}</td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
      </Card>

      </div><div><Card title="Invitations waiting">
        {invites.isPending && <Loading label="Loading invitations…" />}
        {invites.error && <Alert>Could not load invitations. <button className="link" onClick={() => void invites.refetch()}>Retry invitations</button></Alert>}
        {invites.data?.length === 0 && <Empty title="No open invitations" />}
        <ul className="plain">
          {invites.data?.map((i) => (
            <li key={i.id} className="row">
              <span>{i.email} as <strong>{roleLabel(i.role)}</strong> <small className="muted">({when(i.created_at)})</small></span>
              <button className="link danger" onClick={() => cancelInvite(i.id)} disabled={action.busy}>Cancel</button>
            </li>
          ))}
        </ul>
        <form onSubmit={invite} noValidate className="inline-form">
          <Field label="Invite by email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setInvited(false) }} required />
          {role === 'owner' && (
            <div className="field">
              <label htmlFor="invite-role">Role</label>
              <select id="invite-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          )}
          <button className="primary" disabled={action.busy || !email}>{action.busy ? 'Working…' : 'Send invitation'}</button>
        </form>
        <p className="muted">The person signs up (or signs in) with this email and accepts the invitation.</p>
      </Card>
      <section className="role-guide"><h2>Roles at a glance</h2><dl><dt>Owner</dt><dd>Everything: shop settings, team, subscription, reports and billing. Only owners change roles.</dd><dt>Admin</dt><dd>Products, purchases, billing, returns, reports, expenses and shop settings; can add or remove Staff only.</dd><dt>Staff</dt><dd>Look up products, create invoices and record payments. No reports, costs, settings or returns.</dd></dl><h2>Invitation states</h2><p className="muted">Pending: sent, not yet accepted. Accepted: the person appears under People with access. Cancel a pending invitation to withdraw it.</p><p className="muted">Removing someone, or changing their role, takes effect on their next request; their open sessions lose access to this shop immediately.</p></section></div></div>
    </div>
  )
}
