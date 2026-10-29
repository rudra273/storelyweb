import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeApi, ok, renderApp, SIGNED_IN } from '../test-utils'

const access = ok('GET','/v1/platform/access',{ platform_admin: true })
const stamp = '2026-10-28T10:00:00Z'
const shop = { shop_id:'shop-12345678', name:'Asha Store', created_at:stamp, plan:'premium',status:'active',effective_status:'active',starts_at:stamp, ends_at:'2026-11-28T10:00:00Z', revision:3,device_count:2,last_sync_at:null }
const premium = { id:'r1',local_shop_id:shop.shop_id,shop_name:shop.name,contact_name:'Asha',phone:'+919876543210',consent_at:stamp,status:'pending',revision:2,created_at:stamp,updated_at:stamp,starts_at:null,ends_at:null,approved_email:null }
const kpis = { as_of:stamp, registered_shops:12, active_premium:7,scheduled:1,expired:2,suspended:1,expiring_7d:3,synced_24h:4,request_backlog:5,oldest_request_at:stamp }
afterEach(() => vi.unstubAllGlobals())

describe('developer console', () => {
  it('keeps the platform destination through sign-in', async () => {
    const user=userEvent.setup()
    fakeApi([ok('POST','/v1/auth/refresh',{},401),ok('POST','/v1/auth/login',{access_token:'t'}),ok('GET','/v1/me',{id:'u1',email:'dev@example.com',email_verified:true}),access,ok('GET','/v1/platform/kpis',kpis)])
    renderApp('/platform')
    await user.type(await screen.findByLabelText('Email'),'dev@example.com')
    await user.type(screen.getByLabelText('Password',{exact:true}),'A-test-password')
    await user.click(screen.getByRole('button',{name:'Sign in'}))
    expect(await screen.findByRole('heading',{name:'Platform overview'})).toBeInTheDocument()
  })

  it('denies a shop user before requesting metadata or loading shop onboarding', async () => {
    const calls = fakeApi([...SIGNED_IN,ok('GET','/v1/platform/access',{ error:{code:'platform_access_required',message:'Developer access with MFA is required.'} },403)])
    renderApp('/platform/shops')
    expect(await screen.findByRole('heading',{name:'Developer access required'})).toBeInTheDocument()
    expect(calls.some(c => c.path === '/v1/me/shops' || c.path.startsWith('/v1/platform/shops?'))).toBe(false)
    expect(screen.getAllByRole('link',{name:'Account security'})[0]).toHaveAttribute('href','/platform/account/security')
  })
  it('loads developer overview without any shop membership and defines each KPI', async () => {
    const calls = fakeApi([...SIGNED_IN,access,ok('GET','/v1/platform/kpis',kpis)])
    renderApp('/platform')
    expect(await screen.findByText('12')).toBeInTheDocument()
    expect(screen.getByText(/Offline-only shops are unknown/)).toBeInTheDocument()
    expect(screen.getByText(/not an uptime or error-rate metric/)).toBeInTheDocument()
    expect(calls.some(c => c.path.includes('/v1/shops/'))).toBe(false)
  })
  it('reviews a phone request with verified account, interval, reason and revision', async () => {
    const user = userEvent.setup()
    const calls=fakeApi([...SIGNED_IN,access,ok('GET',/^\/v1\/platform\/premium-requests\?/, [premium]),ok('PUT','/v1/platform/premium-requests/r1',{...premium,status:'approved'})])
    renderApp('/platform/requests')
    await user.click(await screen.findByRole('button',{name:'Review Asha Store'}))
    const dialog=screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('Decision'),'approved')
    expect(within(dialog).getByRole('button',{name:'Save review'})).toBeDisabled()
    await user.type(within(dialog).getByLabelText('Verified owner email'),'asha@example.com')
    await user.type(within(dialog).getByLabelText('Reason'),'Contact verified')
    await user.click(within(dialog).getByRole('button',{name:'Save review'}))
    await waitFor(() => expect(calls.some(c => c.method==='PUT')).toBe(true))
    const body=calls.find(c => c.method==='PUT')?.body as Record<string,unknown>
    expect(body).toMatchObject({status:'approved',approved_email:'asha@example.com',expected_revision:2,reason:'Contact verified'})
    expect(body.starts_at).toBeTruthy()
    expect(body.ends_at).toBeTruthy()
    expect(body.receipt_secret).toBeUndefined()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
  it('requires deliberate subscription confirmation and reports concurrent edits', async () => {
    const user=userEvent.setup()
    const calls=fakeApi([...SIGNED_IN,access,ok('GET',/^\/v1\/platform\/shops\?/, {items:[shop],total:1}),ok('PUT',`/v1/platform/shops/${shop.shop_id}/subscription`,{error:{code:'subscription_changed',message:'The subscription changed. Reload before saving.'}},409)])
    renderApp('/platform/shops')
    await user.click(await screen.findByRole('button',{name:'Manage Asha Store'}))
    const d=screen.getByRole('dialog')
    await user.selectOptions(within(d).getByLabelText('Action'),'suspend')
    await user.type(within(d).getByLabelText('Reason'),'Owner requested pause')
    expect(within(d).getByRole('button',{name:'Save subscription'})).toBeDisabled()
    await user.click(within(d).getByRole('checkbox'))
    await user.click(within(d).getByRole('button',{name:'Save subscription'}))
    expect(await within(d).findByRole('alert')).toHaveTextContent('subscription changed')
    expect(calls.find(c => c.method==='PUT')?.body).toMatchObject({status:'suspended',expected_revision:3,reason:'Owner requested pause'})
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
  it('handles empty queues, paging and filters', async () => {
    const user=userEvent.setup()
    const calls=fakeApi([...SIGNED_IN,access,ok('GET',/^\/v1\/platform\/premium-requests\?/,[])])
    renderApp('/platform/requests')
    expect(await screen.findByText('No requests')).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'Next'})).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Status'),'activated')
    await waitFor(() => expect(calls.some(c => c.path.includes('status=activated'))).toBe(true))
  })
  it('shows retry for metadata failures without keeping stale tables visible', async () => {
    fakeApi([...SIGNED_IN,access,ok('GET',/^\/v1\/platform\/shops\?/, {error:{code:'network',message:'Cannot reach the server.'}},503)])
    renderApp('/platform/shops')
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server')
    expect(screen.getByRole('button',{name:'Retry'})).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
  it('reads filtered append-only history without edit controls', async () => {
    const state={status:'active',plan:'premium',starts_at:stamp,ends_at:stamp,revision:'1',request_id:null}
    const calls=fakeApi([...SIGNED_IN,access,ok('GET',/^\/v1\/platform\/history\?/, {total:1,items:[{id:1,actor_id:'developer-uuid',shop_id:shop.shop_id,action:'subscription_changed',reason:'Renewal approved',created_at:stamp,before_state:{...state,status:'expired'},after_state:state}]})])
    renderApp(`/platform/history?shop_id=${shop.shop_id}`)
    expect(await screen.findByText('Renewal approved')).toBeInTheDocument()
    expect(screen.getByText('Actor: developer-uuid')).toBeInTheDocument()
    expect(calls.some(c => c.path.includes(`shop_id=${shop.shop_id}`))).toBe(true)
    expect(calls.some(c => c.method==='PUT' || c.method==='DELETE')).toBe(false)
  })
})
