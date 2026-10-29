import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_SESSION, ACTIVE_ENTITLEMENT, fakeApi, ok, renderApp } from '../test-utils'
import { reportShopAccess } from '../api/shopAccessEvents'

const shop = {shop_id:'s1',name:'Asha Stores',role:'owner'}
const shops = ok('GET','/v1/shops',[shop])
const requests = ok('GET','/v1/me/premium-requests',[])
const roleMenu = () => within(screen.getByRole('navigation',{name:'Main'})).queryAllByRole('link').map(a => a.textContent)
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('paid web access', () => {
  for (const state of ['free','expired','suspended','scheduled']) {
    it(`${state} keeps all business routes closed`, async () => {
      const calls = fakeApi([...ACCOUNT_SESSION,shops,requests,ok('GET','/v1/shops/s1/entitlement',{...ACTIVE_ENTITLEMENT,web_access:false,cloud_sync:false,effective_status:state,status:state==='scheduled'?'active':state})])
      renderApp('/products')
      expect(await screen.findByRole('heading',{name:'Cloud subscription'})).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByText('Checking subscription…')).not.toBeInTheDocument())
      expect(screen.queryByRole('heading',{name:'Products'})).not.toBeInTheDocument()
      expect(calls.some(c => /\/(products|reports|bills|categories|units)(\?|$)/.test(c.path))).toBe(false)
      expect(roleMenu()).toEqual(['Home','Cloud subscription'])
    })
  }
  it('fails closed when subscription verification is unavailable and can retry', async () => {
    const user=userEvent.setup()
    const routes=[...ACCOUNT_SESSION,shops,requests,
      {method:'GET',path:'/v1/shops/s1/entitlement',status:503,body:{error:{message:'Unavailable'}}},
    ]
    const calls=fakeApi(routes)
    renderApp('/products')
    expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable')
    expect(calls.some(c => c.path.includes('/products'))).toBe(false)
    routes[4]=ok('GET','/v1/shops/s1/entitlement',ACTIVE_ENTITLEMENT)
    await user.click(screen.getByRole('button',{name:'Refresh access'}))
    await waitFor(() => expect(roleMenu()).toContain('Products'))
  })
  it('refreshes access after renewal and leaves the same shop selected', async () => {
    let active=false
    const user=userEvent.setup()
    fakeApi([...ACCOUNT_SESSION,shops,requests,ok('GET','/v1/shops/s1/entitlement',() => ({...ACTIVE_ENTITLEMENT,web_access:active,cloud_sync:active,effective_status:active?'active':'expired'}))])
    renderApp('/subscription')
    expect(await screen.findByText('Your subscription has expired')).toBeInTheDocument()
    active=true
    await user.click(screen.getByRole('button',{name:'Refresh access'}))
    expect(await screen.findByText('Premium is active')).toBeInTheDocument()
    expect(roleMenu()).toContain('Products')
    expect(screen.getAllByText('Asha Stores').length).toBeGreaterThan(0)
  })
  it('does not query a second shop business endpoint before its access check', async () => {
    const user=userEvent.setup()
    const calls=fakeApi([...ACCOUNT_SESSION,requests,ok('GET','/v1/shops',[shop,{...shop,shop_id:'s2',name:'Other Store'}]),
      ok('GET','/v1/shops/s1/entitlement',ACTIVE_ENTITLEMENT),
      ok('GET','/v1/shops/s2/entitlement',{...ACTIVE_ENTITLEMENT,shop_id:'s2',web_access:false,cloud_sync:false,effective_status:'suspended'}),
    ])
    renderApp('/subscription')
    expect(await screen.findByText('Premium is active')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Shop'),'s2')
    expect(await screen.findByText('Your subscription is suspended')).toBeInTheDocument()
    expect(roleMenu()).toEqual(['Home','Cloud subscription'])
    expect(calls.some(c => c.path.startsWith('/v1/shops/s2/') && !c.path.endsWith('/entitlement'))).toBe(false)
  })
  it('closes business views on server rejection, then rechecks entitlement', async () => {
    let active=true
    fakeApi([...ACCOUNT_SESSION,shops,requests,ok('GET','/v1/shops/s1/entitlement',()=>({...ACTIVE_ENTITLEMENT,web_access:active,cloud_sync:active,effective_status:active?'active':'suspended'}))])
    renderApp('/subscription')
    expect(await screen.findByText('Premium is active')).toBeInTheDocument()
    active=false
    act(()=>reportShopAccess({shopId:'s1',membership:false}))
    expect(await screen.findByText('Your subscription is suspended')).toBeInTheDocument()
    expect(roleMenu()).toEqual(['Home','Cloud subscription'])
  })
  it('uses the server clock to expire access without waiting for polling', async () => {
    let calls=0
    fakeApi([...ACCOUNT_SESSION,shops,requests,ok('GET','/v1/shops/s1/entitlement',()=>{
      calls++
      return {...ACTIVE_ENTITLEMENT,server_time:'2026-01-01T00:00:00Z',ends_at:'2026-01-01T00:00:01Z',web_access:calls===1,cloud_sync:calls===1,effective_status:calls===1?'active':'expired'}
    })])
    renderApp('/subscription')
    expect(await screen.findByText('Premium is active')).toBeInTheDocument()
    // The test machine's clock is months beyond the server fixture: the server
    // interval, rather than the local absolute clock, determines the deadline.
    expect(await screen.findByText('Your subscription has expired',{}, {timeout:3000})).toBeInTheDocument()
    expect(calls).toBeGreaterThan(1)
  })
  it('keeps security reachable without loading shops or entitlements', async () => {
    const calls=fakeApi([...ACCOUNT_SESSION,ok('GET','/v1/me/mfa',{enabled:false,recovery_codes_remaining:0}),ok('GET','/v1/me/sessions',[]),ok('GET','/v1/me/security-events',[])])
    renderApp('/account/security')
    expect(await screen.findByRole('heading',{name:'Security'})).toBeInTheDocument()
    expect(calls.some(c => c.path==='/v1/shops' || c.path.endsWith('/entitlement'))).toBe(false)
  })
  it('removes free cloud-shop creation from onboarding and shows account-bound approval', async () => {
    const calls=fakeApi([...ACCOUNT_SESSION,ok('GET','/v1/shops',[]),ok('GET','/v1/invites/pending',[]),ok('GET','/v1/me/premium-requests',[{id:'r',shop_name:'Phone store',status:'approved',starts_at:null,ends_at:null}])])
    renderApp('/')
    expect(await screen.findByText('Phone store')).toBeInTheDocument()
    expect(screen.getByText(/Awaiting activation/)).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Create shop'})).not.toBeInTheDocument()
    expect(calls.some(c => c.method==='POST' && c.path==='/v1/shops')).toBe(false)
  })
})
