// Real Chromium -> TLS proxy -> React/API/Postgres/Mailpit. No mocked responses.
const { chromium } = require('playwright')
const crypto = require('node:crypto')
const decodeQr = require('jsqr')
const say = message => process.stdout.write(message + '\n')
const ORIGIN = 'https://app.storely.localhost'
const MAIL = 'http://host.docker.internal:8025'
const run = process.env.PLATFORM_BROWSER_RUN
if (!/^[0-9a-f-]{36}$/.test(run || '')) throw new Error('A per-run fixture UUID is required')
const developer = `platform-dev-${run}@example.com`
const owner = `platform-owner-${run}@example.com`
const shopId = `platform-shop-${run}`
const shopName = `Browser Store ${run}`
const password = crypto.randomBytes(24).toString('base64url')
function assert(ok, message) { if (!ok) throw new Error(message) }
async function mailCode(email) {
  for(let i=0;i<100;i++) {
    const found = await (await fetch(`${MAIL}/api/v1/search?query=to:${encodeURIComponent(email)}`)).json()
    for (const m of found.messages || []) {
      const msg=await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json()
      const code=/\b(\d{6})\b/.exec(msg.Text)
      if (code) return code[1]
    }
    await new Promise(r => setTimeout(r,200))
  }
  throw new Error('Verification mail not received')
}
function totp(s) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits=''
  for(const c of s.replace(/=+$/,'')) bits+=alphabet.indexOf(c).toString(2).padStart(5,'0')
  const key=Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b,2)))
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)))
  const h=crypto.createHmac('sha1',key).update(counter).digest();const o=h[19]&15
  return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0')
}
;(async () => {
 const browser=await chromium.launch({args:['--host-resolver-rules=MAP app.storely.localhost host.docker.internal']})
 const ctx=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1050}})
 const page=await ctx.newPage();page.setDefaultTimeout(15000)
 const errors=[]; page.on('pageerror', e=>errors.push(e.message))
 async function call(method,path,data,token) {
   const r=await ctx.request.fetch(ORIGIN+path,{method,data,headers:{'X-Requested-With':'storely-web',...(token?{Authorization:`Bearer ${token}`}:{})}})
   const body=r.status()===204?null:await r.json();assert(r.ok(),`${method} ${path}: ${r.status()} ${JSON.stringify(body)}`);return body
 }
 async function signup(email) { await call('POST','/v1/auth/signup',{email,password}); await call('POST','/v1/auth/verify-email',{email,code:await mailCode(email)}) }
 try {
   await signup(developer); await signup(owner)
   const ownerLogin=await call('POST','/v1/auth/login',{email:owner,password,client:'mobile'})
   const receipt=crypto.randomBytes(32).toString('base64url')
   const requested=await call('POST','/v1/premium-requests',{id:crypto.randomUUID(),receipt_secret:receipt,local_shop_id:shopId,shop_name:shopName,contact_name:'Browser Owner',phone:'+91'+String(1000000000+crypto.randomInt(8000000000)),contact_consent:true})
   await page.goto(ORIGIN+'/platform')
   await page.getByLabel('Email',{exact:true}).fill(developer)
   await page.getByLabel('Password',{exact:true}).fill(password)
   await page.getByRole('button',{name:'Sign in',exact:true}).click()
   await page.getByRole('heading',{name:'Developer access required'}).waitFor()
   say('PASS password-only session denied without shop onboarding')
   await page.getByRole('navigation',{name:'Developer console'}).getByRole('link',{name:'Account security'}).click()
   const setupReply = page.waitForResponse(r => r.url().endsWith('/v1/me/mfa/setup') && r.request().method() === 'POST')
   await page.getByRole('button',{name:'Set up',exact:true}).click()
   const provision = await (await setupReply).json()
   const pixels = await page.getByRole('img',{name:'Authenticator setup QR code'}).evaluate(async svg => {
     const image = new Image()
     image.src = 'data:image/svg+xml;base64,' + btoa(new XMLSerializer().serializeToString(svg))
     await image.decode()
     const canvas = document.createElement('canvas')
     canvas.width = 448; canvas.height = 448
     const context = canvas.getContext('2d')
     context.fillStyle = '#fff'; context.fillRect(0,0,448,448)
     context.drawImage(image,0,0,448,448)
     return Array.from(context.getImageData(0,0,448,448).data)
   })
   const decoded = decodeQr(Uint8ClampedArray.from(pixels),448,448)
   assert(decoded?.data === provision.otpauth_uri,'Rendered QR does not match authenticator provisioning URI')
   say('PASS locally rendered authenticator QR decodes to the exact setup URI')
   const secret=(await page.getByLabel('Setup key').textContent()).trim()
   await page.getByLabel('6-digit code',{exact:true}).fill(totp(secret))
   await page.getByRole('button',{name:'Turn on',exact:true}).click()
   const recovery=(await page.getByLabel('Recovery codes').textContent()).trim().split('\n')[0]
   await page.getByRole('button',{name:'I have saved them'}).click()
   await page.getByRole('banner').getByRole('button',{name:'Sign out',exact:true}).click()
   await page.goto(ORIGIN+'/platform')
   await page.getByLabel('Email',{exact:true}).fill(developer)
   await page.getByLabel('Password',{exact:true}).fill(password)
   await page.getByRole('button',{name:'Sign in',exact:true}).click()
   await page.getByLabel('Code',{exact:true}).fill(recovery)
   await page.getByRole('button',{name:'Verify',exact:true}).click()
   await page.getByRole('heading',{name:'Platform overview'}).waitFor()
   await page.getByText('Registered shops',{exact:true}).waitFor()
   await page.screenshot({path:'/shots/platform-overview.png',fullPage:true})
   say('PASS developer MFA login and real KPI overview')
   await page.getByRole('link',{name:'Premium requests',exact:true}).click()
   await page.getByRole('button',{name:`Review ${shopName}`,exact:true}).click()
   const dialog=page.getByRole('dialog')
   await dialog.getByLabel('Decision').selectOption('approved')
   await dialog.getByLabel('Verified owner email').fill(owner)
   await dialog.getByLabel('Reason',{exact:true}).fill('Browser verified owner and contact')
   await dialog.getByRole('button',{name:'Save review'}).click()
   await dialog.waitFor({state:'hidden'})
   const approved=await call('POST',`/v1/premium-requests/${requested.id}/status`,{receipt_secret:receipt})
   assert(approved.status==='approved','Review did not approve')
   const claimed=await call('POST',`/v1/premium-requests/${requested.id}/claim`,{receipt_secret:receipt},ownerLogin.access_token)
   assert(claimed.status==='activated','Owner claim failed')
   say('PASS browser review -> verified owner activation')
   await page.getByRole('link',{name:'Shops',exact:true}).click()
   await page.getByLabel('Search shop name or ID').fill(shopId)
   await page.getByRole('button',{name:`Manage ${shopName}`,exact:true}).click()
   await page.getByRole('dialog').getByLabel('Action').selectOption('suspend')
   await page.getByRole('dialog').getByLabel('Reason',{exact:true}).fill('Browser pause test')
   await page.getByRole('dialog').getByRole('checkbox').check()
   await page.getByRole('dialog').getByRole('button',{name:'Save subscription'}).click()
   await page.getByRole('dialog').waitFor({state:'hidden'})
   await page.locator('.platform-status').filter({hasText:/^suspended$/}).waitFor()
   const denied=await ctx.request.get(`${ORIGIN}/v1/shops/${shopId}/products`,{headers:{Authorization:`Bearer ${ownerLogin.access_token}`}})
   assert(denied.status()===403,'Suspension must stop business access')
   await page.getByRole('button',{name:`Manage ${shopName}`,exact:true}).click()
   await page.getByRole('dialog').getByLabel('Action').selectOption('resume')
   await page.getByRole('dialog').getByLabel('Reason',{exact:true}).fill('Browser resume test')
   await page.getByRole('dialog').getByRole('checkbox').check()
   await page.getByRole('dialog').getByRole('button',{name:'Save subscription'}).click()
   await page.getByRole('dialog').waitFor({state:'hidden'})
   await page.locator('.platform-status').filter({hasText:/^active$/}).waitFor()
   const enabled=await ctx.request.get(`${ORIGIN}/v1/shops/${shopId}/products`,{headers:{Authorization:`Bearer ${ownerLogin.access_token}`}})
   assert(enabled.status()===200,'Resume must restore business access')
   await page.screenshot({path:'/shots/platform-shops.png',fullPage:true})
   await page.getByRole('table').getByRole('link',{name:'Audit history'}).click()
   await page.getByText('Browser pause test',{exact:true}).waitFor()
   await page.getByText('Browser resume test',{exact:true}).waitFor()
   await page.getByText('Browser verified owner and contact',{exact:true}).waitFor()
   await page.screenshot({path:'/shots/platform-history.png',fullPage:true})
   say('PASS subscription suspend/resume and immutable audit history')
   if (process.env.STORELY_LIFECYCLE_TEST === '1') {
     await require('./lifecycle.cjs')({ browser, ctx, page, call, signup, owner, password, ownerLogin, shopId, run })
   }
   if (process.env.STORELY_WEB_REQUEST_TEST === '1') {
     await require('./web-requests.cjs')({ browser, page, call, owner, password, ownerLogin, run })
   }
   assert(errors.length===0,errors.join('\n'))
   say('ALL PLATFORM BROWSER STEPS PASSED')
 } catch(e) { await page.screenshot({path:'/shots/platform-failure.png',fullPage:true});throw e }
 finally { await browser.close() }
})().catch(e=>{process.stderr.write(String(e.stack || e) + '\n');process.exit(1)})
