const crypto=require('node:crypto')
module.exports=async function webRequests({browser,page,call,owner,password,ownerLogin,run}) {
  const origin='https://app.storely.localhost'
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1100}})
  const view=await context.newPage()
  const assert=(ok,message)=>{if(!ok) throw new Error(message)}
  const log=message=>process.stdout.write(message+'\n')
  const login=await context.request.post(origin+'/v1/auth/login',{headers:{'X-Requested-With':'storely-web'},data:{email:owner,password,client:'web'}})
  assert(login.ok(),'Owner login failed')
  async function submit(kind,name) {
    await view.goto(origin+'/request-premium')
    if(kind==='new_cloud') await view.getByLabel('A new shop starting on the web').check()
    else await view.getByLabel('Android shop code').fill(`platform-android-${run}`)
    await view.getByLabel('Shop name',{exact:true}).fill(name)
    await view.getByLabel('Contact name',{exact:true}).fill('Web fixture owner')
    await view.getByLabel('Phone with country code').fill('+91'+String(1000000000+crypto.randomInt(8000000000)))
    await view.getByLabel('I agree that the Storely team may contact me about this premium request.').check()
    const reply=view.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/v1/me/premium-requests'))
    await view.getByRole('button',{name:'Send premium request',exact:true}).click()
    const response=await reply
    assert(response.status()===201,'Web submit did not succeed')
    const row=await response.json()
    await view.getByText(/Your request was received/).waitFor()
    assert(row.status==='pending'&&row.request_kind===kind,'Wrong request state/kind')
    return row
  }
  async function approve(name) {
    await page.goto(origin+'/platform/requests')
    await page.getByRole('button',{name:`Review ${name}`,exact:true}).click()
    const dialog=page.getByRole('dialog')
    await dialog.getByLabel('Decision').selectOption('approved')
    assert(await dialog.getByLabel('Verified owner email').inputValue()===owner,'Review did not bind requesting account')
    assert(await dialog.getByLabel('Verified owner email').getAttribute('readonly')!==null,'Requester email should not be editable')
    await dialog.getByLabel('Reason',{exact:true}).fill('Verified web request fixture')
    await dialog.getByRole('button',{name:'Save review',exact:true}).click()
    await dialog.waitFor({state:'hidden'})
    await view.getByRole('button',{name:'Refresh request status',exact:true}).click()
  }
  try {
    const cloud=await submit('new_cloud',`Web Request ${run}`)
    const before=(await call('GET','/v1/shops',undefined,ownerLogin.access_token)).length
    await approve(`Web Request ${run}`)
    const activate=view.getByRole('button',{name:'Activate new web shop',exact:true})
    await activate.waitFor()
    assert(await activate.isDisabled(),'Activation needs explicit confirmation')
    await view.getByLabel('Create a new empty cloud shop. I am not transferring an existing Android shop.').check()
    const activated=view.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith(`/premium-requests/${cloud.id}/activate`))
    await activate.click()
    assert((await activated).ok(),'New cloud activation failed')
    await view.getByLabel('Shop',{exact:true}).waitFor()
    await view.getByLabel('Shop',{exact:true}).selectOption(cloud.local_shop_id)
    await view.locator('.workspace-shop').filter({hasText:`Web Request ${run}`}).waitFor()
    const entitlement=await call('GET',`/v1/shops/${cloud.local_shop_id}/entitlement`,undefined,ownerLogin.access_token)
    assert(entitlement.web_access&&entitlement.cloud_sync,'Approved web shop did not gain paid access')
    await call('POST',`/v1/me/premium-requests/${cloud.id}/activate`,{confirm_new_shop:true},ownerLogin.access_token)
    assert((await call('GET','/v1/shops',undefined,ownerLogin.access_token)).length===before+1,'Replay duplicated cloud shop')
    await view.screenshot({path:'/shots/web-request-activated.png',fullPage:true})
    log('PASS web form -> pending admin queue -> requester-bound approval -> explicit new-shop activation -> paid workspace')
    const android=await submit('existing_android',`Web Android ${run}`)
    await approve(`Web Android ${run}`)
    await view.getByText(/Awaiting activation: sign in with this account on the original Android phone/).waitFor()
    assert(await view.getByRole('button',{name:'Activate new web shop',exact:true}).count()===0,'Android shop must activate on the phone')
    assert(android.local_shop_id===`platform-android-${run}`,'Android shop code was changed')
    await view.screenshot({path:'/shots/web-request-android-approved.png',fullPage:true})
    log('PASS web request for existing Android shop preserves code and defers backup/upload activation to phone')
  } catch(e) {await view.screenshot({path:'/shots/web-request-failure.png',fullPage:true});throw e}
  finally {await context.close()}
}
