// Invoked by platform.cjs after real developer MFA/review/claim checks.
module.exports = async function lifecycle({ browser, ctx, call, signup, owner, password, ownerLogin, shopId, run }) {
  const ORIGIN='https://app.storely.localhost'
  const expect=(ok,message)=>{if(!ok) throw new Error(message)}
  const say=message=>process.stdout.write(message+'\n')
  const admin=(await call('POST','/v1/auth/refresh',{})).access_token
  const current=(await call('GET',`/v1/platform/shops/${shopId}/subscription`,undefined,admin))
  let revision=current.revision
  async function subscription(status,ended=false) {
    const result=await call('PUT',`/v1/platform/shops/${shopId}/subscription`,{
      status, starts_at:current.starts_at,ends_at:ended?new Date(Date.now()-1000).toISOString():current.ends_at,
      expected_revision:revision,reason:`Browser lifecycle ${status}${ended?' elapsed':''}`,
    },admin)
    revision=result.revision
    return result
  }
  async function signedInBrowser(email) {
    const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1050}})
    const login=await context.request.post(ORIGIN+'/v1/auth/login',{headers:{'X-Requested-With':'storely-web'},data:{email,password,client:'web'}})
    expect(login.ok(),'Browser fixture login failed')
    return {context,view:await context.newPage()}
  }
  await call('POST',`/v1/shops/${shopId}/products`,{name:'Lifecycle preserved rice',selling_price:'12.50',opening_quantity:'10'},ownerLogin.access_token)
  const account=await signedInBrowser(owner)
  const ownerView=account.view
  await ownerView.goto(ORIGIN+'/products')
  await ownerView.getByRole('button',{name:'Lifecycle preserved rice',exact:true}).waitFor()
  await ownerView.screenshot({path:'/shots/lifecycle-active.png',fullPage:true})
  // A developer suspension stops server writes and does not retain a business UI.
  await subscription('suspended')
  await ownerView.getByPlaceholder('Search name, code or barcode').fill('preserved')
  await ownerView.getByText('Your subscription is suspended',{exact:true}).waitFor()
  expect(await ownerView.getByRole('button',{name:'Lifecycle preserved rice',exact:true}).count()===0,'Suspended product was still rendered')
  await ownerView.goto(ORIGIN+'/account/security')
  await ownerView.getByRole('heading',{name:'Security',exact:true}).waitFor()
  await ownerView.goto(ORIGIN+'/subscription')
  await ownerView.getByText('Your subscription is suspended',{exact:true}).waitFor()
  await ownerView.screenshot({path:'/shots/lifecycle-suspended.png',fullPage:true})
  await subscription('active')
  await ownerView.getByRole('button',{name:'Refresh access',exact:true}).click()
  await ownerView.getByText('Premium is active',{exact:true}).waitFor()
  await ownerView.goto(ORIGIN+'/products')
  await ownerView.getByRole('button',{name:'Lifecycle preserved rice',exact:true}).waitFor()
  // Elapsed active is effectively expired, even without explicit expired status.
  await subscription('active',true)
  await ownerView.reload()
  await ownerView.getByText('Your subscription has expired',{exact:true}).waitFor()
  await ownerView.screenshot({path:'/shots/lifecycle-expired.png',fullPage:true})
  await subscription('active')
  await ownerView.getByRole('button',{name:'Refresh access',exact:true}).click()
  await ownerView.getByRole('button',{name:'Lifecycle preserved rice',exact:true}).waitFor()
  say('PASS real owner web suspension, account security, expiry and renewal preserve products')
  // Separate staff browser; revoking membership clears the workspace on the next
  // denied request. An expired subscription is not misreported as revoked staff.
  const staff=`platform-staff-${run}@example.com`
  await signup(staff)
  await call('POST',`/v1/shops/${shopId}/invites`,{email:staff,role:'staff'},ownerLogin.access_token)
  const staffLogin=await call('POST','/v1/auth/login',{email:staff,password,client:'mobile'})
  await call('POST','/v1/invites/accept',{shop_id:shopId},staffLogin.access_token)
  const staffUser=await call('GET','/v1/me',undefined,staffLogin.access_token)
  const staffAccount=await signedInBrowser(staff)
  await staffAccount.view.goto(ORIGIN+'/products')
  await staffAccount.view.getByRole('button',{name:'Lifecycle preserved rice',exact:true}).waitFor()
  await call('DELETE',`/v1/shops/${shopId}/members/${staffUser.id}`,undefined,ownerLogin.access_token)
  // The page reload is a fresh role/membership check, never cached membership.
  await staffAccount.view.reload()
  await staffAccount.view.getByRole('heading',{name:'Welcome to Storely',exact:true}).waitFor()
  expect(await staffAccount.view.getByRole('button',{name:'Lifecycle preserved rice',exact:true}).count()===0,'Revoked staff still sees products')
  await staffAccount.view.screenshot({path:'/shots/lifecycle-revoked-staff.png',fullPage:true})
  const latest=await call('GET',`/v1/shops/${shopId}/products`,undefined,ownerLogin.access_token)
  expect(latest.items.some(p=>p.name==='Lifecycle preserved rice'),'Lifecycle lost stored product')
  expect(await ctx.request.get(ORIGIN+'/v1/me/premium-requests',{headers:{Authorization:`Bearer ${ownerLogin.access_token}`}}).then(r=>r.ok()),'Account request status not accessible')
  if (process.env.STORELY_LOAD_TEST === '1') {
    await require('./local-load.cjs')({ ctx, origin: ORIGIN, shopId, ownerToken: ownerLogin.access_token })
  }
  await account.context.close();await staffAccount.context.close()
  say('ALL SUBSCRIPTION LIFECYCLE BROWSER STEPS PASSED')
}
