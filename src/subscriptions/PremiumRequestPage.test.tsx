import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { ACCOUNT_SESSION, fakeApi, ok, renderApp } from '../test-utils'

const row={id:'request-id',local_shop_id:'request-id',shop_name:'My web shop',status:'pending',revision:0,created_at:'2026-10-29T00:00:00Z',updated_at:'2026-10-29T00:00:00Z',starts_at:null,ends_at:null,channel:'web',request_kind:'new_cloud'}
const base=()=>[...ACCOUNT_SESSION,ok('GET','/v1/me/premium-requests',[])]
afterEach(()=>vi.unstubAllGlobals())
async function fill(kind:'new_cloud'|'existing_android') {
  const user=userEvent.setup()
  await screen.findByRole('heading',{name:'Request Premium'})
  if(kind==='new_cloud') await user.click(screen.getByLabelText('A new shop starting on the web'))
  else await user.type(screen.getByLabelText('Android shop code'),'phone-shop-123')
  await user.type(screen.getByLabelText('Shop name'),'My web shop')
  const contact=screen.getByLabelText('Contact name')
  await user.clear(contact); await user.type(contact,'Shop owner')
  await user.type(screen.getByLabelText('Phone with country code'),'+919876543210')
  await user.click(screen.getByRole('checkbox'))
  return user
}
for(const kind of ['new_cloud','existing_android'] as const) {
  test(`submits a ${kind} request and does not create a shop`,async()=>{
    const calls=fakeApi([...base(),ok('POST','/v1/me/premium-requests',row,201)])
    renderApp('/request-premium')
    const user=await fill(kind)
    await user.click(screen.getByRole('button',{name:'Send premium request'}))
    expect(await screen.findByText(/Your request was received/)).toBeInTheDocument()
    expect(calls.find(c=>c.method==='POST'&&c.path==='/v1/me/premium-requests')?.body).toMatchObject({request_kind:kind,shop_id:kind==='new_cloud'?null:'phone-shop-123',shop_name:'My web shop',contact_name:'Shop owner',phone:'+919876543210',contact_consent:true})
    expect(calls.some(c=>c.method==='POST'&&c.path==='/v1/shops')).toBe(false)
    expect(localStorage.getItem('storely.premium')).toBeNull()
  })
}
test('a lost response retains the same request ID and payload for retry',async()=>{
  const routes=[...base(),ok('POST','/v1/me/premium-requests',{error:{code:'network',message:'Connection lost'}},503)]
  const calls=fakeApi(routes)
  renderApp('/request-premium')
  const user=await fill('new_cloud')
  await user.click(screen.getByRole('button',{name:'Send premium request'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost')
  expect(screen.getByLabelText('Shop name')).toBeDisabled()
  routes[3]=ok('POST','/v1/me/premium-requests',row,201)
  await user.click(screen.getByRole('button',{name:'Retry same request'}))
  expect(await screen.findByText(/Your request was received/)).toBeInTheDocument()
  const sent=calls.filter(c=>c.method==='POST'&&c.path==='/v1/me/premium-requests')
  expect(sent).toHaveLength(2)
  expect(sent[1]?.body).toEqual(sent[0]?.body)
})
test('rejects missing consent or malformed contact phone in the form',async()=>{
  fakeApi(base())
  renderApp('/request-premium')
  await screen.findByRole('heading',{name:'Request Premium'})
  expect(screen.getByRole('button',{name:'Send premium request'})).toBeDisabled()
  expect(screen.getByLabelText('Phone with country code')).toHaveAttribute('pattern','\\+[1-9][0-9]{7,14}')
})
test('only approved new cloud requests offer confirmed web activation',async()=>{
  const calls=fakeApi([...ACCOUNT_SESSION,ok('GET','/v1/me/premium-requests',[{...row,status:'approved'},{...row,id:'android-request',request_kind:'existing_android',status:'approved',shop_name:'Phone shop'}]),ok('POST','/v1/me/premium-requests/request-id/activate',{...row,status:'activated'}),ok('GET','/v1/shops',[]),ok('GET','/v1/invites/pending',[])])
  renderApp('/request-premium')
  const user=userEvent.setup()
  const activate=await screen.findByRole('button',{name:'Activate new web shop'})
  expect(activate).toBeDisabled()
  await user.click(screen.getByLabelText('Create a new empty cloud shop. I am not transferring an existing Android shop.'))
  await user.click(activate)
  await waitFor(()=>expect(calls.some(c=>c.path==='/v1/me/premium-requests/request-id/activate')).toBe(true))
  expect(calls.find(c=>c.path.endsWith('/activate'))?.body).toEqual({confirm_new_shop:true})
  expect(calls.some(c=>c.path.includes('/android-request/activate'))).toBe(false)
})
