import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { ACCOUNT_SESSION, fakeApi, ok, renderApp } from '../../test-utils'

const setup = {
  secret:'JBSWY3DPEHPK3PXP',
  otpauth_uri:'otpauth://totp/Storely:fixture%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Storely&algorithm=SHA1&digits=6&period=30',
}
const routes = () => [
  ...ACCOUNT_SESSION,
  ok('GET','/v1/me/mfa',{enabled:false,recovery_codes_remaining:0}),
  ok('GET','/v1/me/sessions',[]),ok('GET','/v1/me/security-events',[]),
  ok('POST','/v1/me/mfa/setup',setup),
]
afterEach(()=>vi.unstubAllGlobals())
for (const path of ['/account/security','/platform/account/security']) {
  test(`shows a local QR and manual fallback on ${path}; cancel clears both`,async()=>{
    const user=userEvent.setup()
    const calls=fakeApi(routes())
    renderApp(path)
    await user.click(await screen.findByRole('button',{name:'Set up'}))
    const qr=await screen.findByRole('img',{name:'Authenticator setup QR code'})
    expect(qr.tagName.toLowerCase()).toBe('svg')
    expect(qr.querySelector('path')).not.toBeNull()
    expect(screen.getByLabelText('Setup key')).toHaveTextContent(setup.secret)
    expect(screen.getByText(/Can’t scan/)).toBeInTheDocument()
    expect(qr.querySelector('image')).toBeNull()
    expect(calls.every(c=>c.path.startsWith('/v1/'))).toBe(true)
    await user.click(screen.getByRole('button',{name:'Cancel'}))
    expect(screen.queryByRole('img',{name:'Authenticator setup QR code'})).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Setup key')).not.toBeInTheDocument()
  })
}
test('successful enable clears the QR/secret and shows recovery codes',async()=>{
  const user=userEvent.setup()
  const apiRoutes=routes()
  apiRoutes.push(ok('POST','/v1/me/mfa/enable',{recovery_codes:['recovery-one','recovery-two']}))
  const calls=fakeApi(apiRoutes)
  renderApp('/platform/account/security')
  await user.click(await screen.findByRole('button',{name:'Set up'}))
  await screen.findByRole('img',{name:'Authenticator setup QR code'})
  await user.type(screen.getByLabelText('6-digit code'),'123456')
  await user.click(screen.getByRole('button',{name:'Turn on'}))
  expect(await screen.findByLabelText('Recovery codes')).toHaveTextContent('recovery-one')
  await waitFor(()=>expect(screen.queryByRole('img',{name:'Authenticator setup QR code'})).not.toBeInTheDocument())
  expect(screen.queryByLabelText('Setup key')).not.toBeInTheDocument()
  expect(calls.find(c=>c.path==='/v1/me/mfa/enable')?.body).toEqual({code:'123456'})
})
