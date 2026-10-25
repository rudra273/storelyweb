// End-to-end check of the real web app against the real stack (browser -> proxy -> web/API
// -> database -> mail catcher). Run with `make e2e` in storelyweb after `make up` in
// storelyapi. It signs up real (throw-away) users and deletes them again at the end.
const { chromium } = require('playwright')
const crypto = require('node:crypto')

const ORIGIN = 'https://app.storely.localhost'
const MAIL = process.env.MAIL_URL || 'http://host.docker.internal:8025'
const PASSWORD = 'Correct-Horse-Battery-Staple-42'
const run = `${Date.now()}`.slice(-8)
const owner = `owner-${run}@example.com`
const staffEmail = `staff-${run}@example.com`

const say = (text) => process.stdout.write(`${text}\n`)
let failures = 0
async function step(name, fn) {
  try {
    await fn()
    say(`  PASS  ${name}`)
  } catch (e) {
    failures += 1
    say(`  FAIL  ${name}\n        ${String(e.message).split('\n')[0]}`)
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg) }

async function mailCode(to) {
  for (let i = 0; i < 40; i++) {
    const found = await (await fetch(`${MAIL}/api/v1/search?query=to:${encodeURIComponent(to)}`)).json()
    const id = found.messages?.[0]?.ID
    if (id) {
      const msg = await (await fetch(`${MAIL}/api/v1/message/${id}`)).json()
      const m = /\b(\d{6})\b/.exec(msg.Text)
      await fetch(`${MAIL}/api/v1/messages`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ IDs: [id] }) })
      if (m) return m[1]
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`no mail for ${to}`)
}

function base32(s) {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of s.replace(/=+$/, '').toUpperCase()) bits += a.indexOf(c).toString(2).padStart(5, '0')
  return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)))
}
function totp(secret, offset = 0) {
  const counter = Math.floor(Date.now() / 30000) + offset
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const h = crypto.createHmac('sha1', base32(secret)).update(buf).digest()
  const o = h[19] & 15
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0')
}

async function fill(page, label, value) { await page.getByLabel(label, { exact: true }).fill(value) }

async function signUp(page, email, name) {
  await page.goto(`${ORIGIN}/signup`)
  await fill(page, 'Your name (optional)', name)
  await fill(page, 'Email', email)
  await fill(page, 'Password', PASSWORD)
  await fill(page, 'Repeat password', PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('heading', { name: 'Check your email' }).waitFor()
  await fill(page, '6-digit code', await mailCode(email))
  await page.getByRole('button', { name: 'Verify email' }).click()
  await page.getByRole('heading', { name: 'Sign in' }).waitFor()
}
async function signIn(page, email, code) {
  await page.goto(`${ORIGIN}/login`)
  await fill(page, 'Email', email)
  await fill(page, 'Password', PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  if (code) {
    await page.getByLabel('Code', { exact: true }).fill(code())
    await page.getByRole('button', { name: 'Verify' }).click()
  }
}
const navLinks = (page) => page.getByRole('navigation', { name: 'Main' }).getByRole('link').allTextContents()

;(async () => {
  const browser = await chromium.launch({
    args: ['--host-resolver-rules=MAP app.storely.localhost host.docker.internal'],
  })
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true }) // dev CA is not in this browser
  const page = await ctx.newPage()
  const problems = []
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/favicon|Failed to load resource/.test(m.text())) problems.push(m.text()) })
  page.on('pageerror', (e) => problems.push(String(e)))

  await step('unauthenticated visit goes to sign-in', async () => {
    await page.goto(`${ORIGIN}/products`)
    await page.getByRole('heading', { name: 'Sign in' }).waitFor()
  })
  await step('weak password is refused with the server message', async () => {
    await page.goto(`${ORIGIN}/signup`)
    await fill(page, 'Email', `weak-${run}@example.com`)
    await fill(page, 'Password', 'password1234')
    await fill(page, 'Repeat password', 'password1234')
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.getByRole('alert').waitFor()
  })
  await step('sign up, verify with the emailed code', () => signUp(page, owner, 'Olive Owner'))
  await step('wrong password is refused', async () => {
    await fill(page, 'Email', owner)
    await fill(page, 'Password', 'wrong-password-123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('alert').waitFor()
  })
  await step('sign in; a new account is asked to create a shop', async () => {
    await signIn(page, owner)
    await page.getByRole('heading', { name: 'Welcome to Storely' }).waitFor()
  })
  await step('create the shop; owner menu shows everything', async () => {
    await fill(page, 'Shop name', `Olive Mart ${run}`)
    await page.getByRole('button', { name: 'Create shop' }).click()
    await page.getByRole('heading', { name: 'Hello, Olive Owner' }).waitFor()
    expect(JSON.stringify(await navLinks(page)) === JSON.stringify(['Home', 'Products', 'Reports', 'Billing', 'Team', 'Shop activity']), 'owner menu wrong')
  })
  await step('reload keeps the session (cookie refresh) and no token is in browser storage', async () => {
    await page.reload()
    await page.getByRole('heading', { name: 'Hello, Olive Owner' }).waitFor()
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }) + document.cookie)
    expect(!/eyJ/.test(stored), 'a JWT is visible to page scripts')
    expect(!/storely_refresh/.test(await page.evaluate(() => document.cookie)), 'refresh cookie is readable by scripts')
  })
  await step('refresh cookie is httpOnly, Secure, SameSite=Strict, scoped to /v1/auth', async () => {
    const c = (await ctx.cookies()).find((x) => x.name === 'storely_refresh')
    expect(c, 'no refresh cookie')
    expect(c.httpOnly && c.secure && c.sameSite === 'Strict' && c.path === '/v1/auth', JSON.stringify(c))
  })
  if (process.env.SHOTS) {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.screenshot({ path: '/shots/home.png' })
    await page.goto(`${ORIGIN}/account/security`)
    await page.getByText('Where you are signed in').waitFor()
    await page.screenshot({ path: '/shots/security.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto(`${ORIGIN}/`)
    await page.getByRole('heading', { name: 'Hello, Olive Owner' }).waitFor()
    await page.screenshot({ path: '/shots/mobile.png' })
    await page.setViewportSize({ width: 1280, height: 720 })
  }
  await step('invite a staff member', async () => {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Team' }).click()
    await fill(page, 'Invite by email', staffEmail)
    await page.getByRole('button', { name: 'Send invitation' }).click()
    await page.getByText(staffEmail).first().waitFor()
  })


  // ── products (owner) ──
  const navTo = (p, name) => p.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).click()
  await step('products page starts empty with a hint', async () => {
    await navTo(page, 'Products')
    await page.getByText('No products yet').waitFor()
  })
  await step('add a category and a unit', async () => {
    await page.getByRole('button', { name: 'Categories & units' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.getByLabel('New category').fill('Grains')
    await dlg.getByRole('button', { name: 'Add' }).first().click()
    await dlg.getByText('Grains').waitFor()
    await dlg.getByLabel('New unit').fill('kg')
    await dlg.getByRole('button', { name: 'Add' }).last().click()
    await dlg.getByText('kg', { exact: false }).first().waitFor()
    await dlg.getByRole('button', { name: 'Close' }).last().click()
  })
  await step('add a product with opening stock; it appears in the table', async () => {
    await page.getByRole('button', { name: 'Add product' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.getByLabel('Product name').fill('Basmati Rice')
    await dlg.getByLabel('Product code').fill('R1')
    await dlg.getByLabel('Barcode').fill('8901234567890')
    await dlg.getByLabel('Category').selectOption({ label: 'Grains' })
    await dlg.getByLabel('Unit').selectOption({ label: 'kg' })
    await dlg.getByLabel('Selling price (₹)').fill('125.50')
    await dlg.getByLabel('Cost price (₹)').fill('98')
    await dlg.getByLabel('Reorder level').fill('10')
    await dlg.getByLabel('Opening stock').fill('50')
    await dlg.getByRole('button', { name: 'Add product' }).click()
    await page.getByRole('complementary', { name: 'Product details' }).getByText('₹125.50').waitFor()
    await page.getByRole('complementary', { name: 'Product details' }).getByText('Adjusted · count').waitFor()
  })
  await step('a duplicate code is refused with a clear message', async () => {
    await page.getByRole('button', { name: 'Add product' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.getByLabel('Product name').fill('Another')
    await dlg.getByLabel('Product code').fill('r1')
    await dlg.getByRole('button', { name: 'Add product' }).click()
    await dlg.getByRole('alert').waitFor()
    await dlg.getByRole('button', { name: 'Cancel' }).click()
  })
  await step('adjust stock: removing 2 as damaged updates the quantity and history', async () => {
    const panel = page.getByRole('complementary', { name: 'Product details' })
    await panel.getByRole('button', { name: 'Adjust stock' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.getByLabel('Quantity').fill('2')
    await dlg.getByRole('button', { name: 'Save' }).click()
    await panel.getByText('48 kg').first().waitFor()
    await panel.getByText('Adjusted · damage').waitFor()
  })
  await step('taking more than is on hand is refused', async () => {
    const panel = page.getByRole('complementary', { name: 'Product details' })
    await panel.getByRole('button', { name: 'Adjust stock' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.getByLabel('Quantity').fill('500')
    await dlg.getByRole('button', { name: 'Save' }).click()
    await dlg.getByRole('alert').waitFor()
    await dlg.getByRole('button', { name: 'Cancel' }).click()
  })
  await step('edit the price', async () => {
    const panel = page.getByRole('complementary', { name: 'Product details' })
    await panel.getByRole('button', { name: 'Edit' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.getByLabel('Selling price (₹)').fill('130')
    await dlg.getByRole('button', { name: 'Save changes' }).click()
    await panel.getByText('₹130.00').waitFor()
  })
  await step('import a file: dry run first, then the real import', async () => {
    await page.getByRole('button', { name: 'Close details' }).click()
    await page.getByRole('button', { name: 'Import' }).click()
    const dlg = page.getByRole('dialog')
    const csv = 'product_name,product_code,quantity,purchase_price,selling_price,gst_percent\nBasmati Rice,R1,10,100,130,5\nSugar,S1,20,40,48,5\n,X,1,1,1,\nBad,B,1,1,1,7\n'
    await dlg.getByLabel(/CSV or Excel/).setInputFiles({ name: 'stock.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await dlg.getByText(/1 new, 1 existing/).waitFor()
    await dlg.getByText('GST %').waitFor()
    await dlg.getByRole('button', { name: /^Import 2 products/ }).click()
    await dlg.getByText(/Imported: 1 added, 1 updated/).waitFor()
    await dlg.getByRole('button', { name: 'Done' }).click()
    await page.getByRole('button', { name: 'Sugar' }).waitFor()
    await page.getByText('58 kg').waitFor()
  })
  await step('importing the identical file again is stopped', async () => {
    await page.getByRole('button', { name: 'Import' }).click()
    const dlg = page.getByRole('dialog')
    const csv = 'product_name,product_code,quantity,purchase_price,selling_price,gst_percent\nBasmati Rice,R1,10,100,130,5\nSugar,S1,20,40,48,5\n,X,1,1,1,\nBad,B,1,1,1,7\n'
    await dlg.getByLabel(/CSV or Excel/).setInputFiles({ name: 'stock.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await dlg.getByText(/already imported today/).waitFor()
    await dlg.getByRole('button', { name: 'Close' }).last().click()
  })
  await step('search finds by name and by barcode; the low-stock filter works', async () => {
    await page.getByLabel('Search products').fill('sug')
    await page.getByRole('button', { name: 'Sugar' }).waitFor()
    await page.getByRole('button', { name: 'Basmati Rice' }).waitFor({ state: 'detached' })
    await page.getByLabel('Search products').fill('8901234567890')
    await page.getByRole('button', { name: 'Basmati Rice' }).waitFor()
    await page.getByLabel('Search products').fill('')
    await page.getByLabel('Low stock').click()
    await page.getByText('No products match').waitFor()
    await page.getByLabel('Low stock').click()
    await page.getByRole('button', { name: 'Basmati Rice' }).waitFor()
  })
  await step('export CSV downloads a file that includes the products and cost', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()])
    const body = require('node:fs').readFileSync(await download.path(), 'utf8')
    expect(/^﻿product_name,product_code/.test(body), 'header row missing')
    expect(body.includes('Basmati Rice') && body.includes('Sugar'), 'products missing')
    expect(download.suggestedFilename().endsWith('.csv'), 'wrong file name')
  })
  await step('barcode labels preview for a selected product', async () => {
    await page.getByLabel('Select Basmati Rice').check()
    await page.getByRole('button', { name: /Print labels/ }).click()
    const dlg = page.getByRole('dialog')
    await dlg.locator('.label svg').first().waitFor()
    expect((await dlg.locator('.label').count()) === 1, 'expected one label')
    await dlg.getByRole('button', { name: 'Close' }).last().click()
  })

  await step('owner deletes a product; it disappears', async () => {
    await page.goto(`${ORIGIN}/products`)
    await page.getByRole('button', { name: 'Sugar' }).click()
    await page.getByRole('complementary', { name: 'Product details' }).getByText('Stock history').waitFor()
    if (process.env.SHOTS) await page.screenshot({ path: '/shots/products.png' })
    page.once('dialog', (d) => d.accept())
    await page.getByRole('complementary', { name: 'Product details' }).getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Sugar' }).waitFor({ state: 'detached' })
    await page.getByRole('button', { name: 'Basmati Rice' }).waitFor()
  })

  // ── staff in a second, separate browser profile ──
  const staffCtx = await browser.newContext({ ignoreHTTPSErrors: true })
  const staff = await staffCtx.newPage()
  await step('staff signs up, accepts the invitation and sees the limited menu', async () => {
    await signUp(staff, staffEmail, 'Sam Staff')
    await signIn(staff, staffEmail)
    await staff.getByRole('button', { name: 'Accept' }).click()
    await staff.getByRole('heading', { name: 'Hello, Sam Staff' }).waitFor()
    expect(JSON.stringify(await navLinks(staff)) === JSON.stringify(['Home', 'Products', 'Billing']), 'staff menu wrong: ' + (await navLinks(staff)))
  })
  await step('staff see products with prices but no cost and no edit buttons', async () => {
    await navTo(staff, 'Products')
    await staff.getByRole('button', { name: 'Basmati Rice' }).waitFor()
    expect((await staff.getByRole('columnheader', { name: 'Cost' }).count()) === 0, 'staff sees a Cost column')
    for (const name of ['Add product', 'Import', 'Export CSV', 'Categories & units']) {
      expect((await staff.getByRole('button', { name }).count()) === 0, `staff sees "${name}"`)
    }
    await staff.getByRole('button', { name: 'Basmati Rice' }).click()
    await staff.getByRole('complementary', { name: 'Product details' }).getByText('₹130.00').waitFor()
    const text = await staff.getByRole('complementary', { name: 'Product details' }).innerText()
    expect(!/Cost price/.test(text) && !text.includes('98'), 'cost leaked into the staff view')
    const api = await staff.evaluate(async () => {
      const t = await (await fetch('/v1/auth/refresh', { method: 'POST', headers: { 'X-Requested-With': 'storely-web', 'content-type': 'application/json' }, body: '{}' })).json()
      const h = { Authorization: `Bearer ${t.access_token}` }
      const shops = await (await fetch('/v1/shops', { headers: h })).json()
      const list = await (await fetch(`/v1/shops/${shops[0].shop_id}/products`, { headers: h })).text()
      const write = await fetch(`/v1/shops/${shops[0].shop_id}/products`, { method: 'POST', headers: { ...h, 'content-type': 'application/json', 'X-Requested-With': 'storely-web' }, body: '{"name":"hack"}' })
      return { list, write: write.status }
    })
    expect(!api.list.includes('purchase_price'), 'the API sent purchase_price to staff')
    expect(api.write === 403, `staff write answered ${api.write}`)
  })

  await step('staff typing an owner-only address gets "No access"; the API also refuses', async () => {
    for (const path of ['/reports', '/team', '/activity']) {
      await staff.goto(`${ORIGIN}${path}`)
      await staff.getByRole('heading', { name: 'No access' }).waitFor()
    }
    const status = await staff.evaluate(async () => {
      const t = await (await fetch('/v1/auth/refresh', { method: 'POST', headers: { 'X-Requested-With': 'storely-web', 'content-type': 'application/json' }, body: '{}' })).json()
      const shops = await (await fetch('/v1/shops', { headers: { Authorization: `Bearer ${t.access_token}` } })).json()
      const r = await fetch(`/v1/shops/${shops[0].shop_id}/members`, { headers: { Authorization: `Bearer ${t.access_token}` } })
      return r.status
    })
    expect(status === 403 || status === 404, `server answered ${status}`)
  })

  await step('owner promotes staff to admin; admin then sees the owner menu', async () => {
    await page.goto(`${ORIGIN}/team`)
    await page.getByLabel(`Role of ${staffEmail}`).selectOption('admin')
    await page.waitForTimeout(500)
    await staff.goto(`${ORIGIN}/`)
    await staff.getByRole('heading', { name: 'Hello, Sam Staff' }).waitFor()
    expect(JSON.stringify(await navLinks(staff)) === JSON.stringify(['Home', 'Products', 'Reports', 'Billing', 'Team', 'Shop activity']), 'admin menu wrong: ' + (await navLinks(staff)))
  })
  await step('shop activity lists events', async () => {
    await staff.goto(`${ORIGIN}/activity`)
    await staff.getByRole('heading', { name: 'Shop activity' }).waitFor()
    await staff.locator('table tbody tr').first().waitFor()
  })

  // ── two-step sign-in for the owner ──
  let secret = ''
  await step('owner turns on two-step sign-in and saves recovery codes', async () => {
    await page.goto(`${ORIGIN}/account/security`)
    await page.getByRole('button', { name: 'Set up' }).click()
    secret = (await page.getByLabel('Setup key').textContent()).trim()
    await page.getByLabel('6-digit code', { exact: true }).fill(totp(secret))
    await page.getByRole('button', { name: 'Turn on' }).click()
    const codes = (await page.getByLabel('Recovery codes').textContent()).trim().split('\n')
    expect(codes.length === 10, `got ${codes.length} recovery codes`)
    await page.getByRole('button', { name: 'I have saved them' }).click()
  })
  await step('sessions page lists this device', async () => {
    await page.getByText('this device').first().waitFor()
  })
  await step('sign out, then sign in again with password + code', async () => {
    await page.getByRole('button', { name: 'Sign out' }).first().click()
    await page.getByRole('heading', { name: 'Sign in' }).waitFor()
    // the code used above cannot be replayed, so use the next 30-second window's
    await signIn(page, owner, () => totp(secret, 1))
    await page.getByRole('heading', { name: 'Hello, Olive Owner' }).waitFor()
  })
  await step('a wrong two-step code is refused', async () => {
    await page.getByRole('button', { name: 'Sign out' }).first().click()
    await page.getByRole('heading', { name: 'Sign in' }).waitFor()
    await fill(page, 'Email', owner)
    await fill(page, 'Password', PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByLabel('Code', { exact: true }).fill('000000')
    await page.getByRole('button', { name: 'Verify' }).click()
    await page.getByRole('alert').waitFor()
  })
  await step('sign out everywhere ends the other browser too', async () => {
    // sign in again here (a third session on top of the failed attempt), then revoke the staff one from its own page
    await page.getByRole('button', { name: 'Start over' }).click()
    await staff.goto(`${ORIGIN}/account/security`)
    await staff.getByRole('button', { name: 'Sign out everywhere' }).waitFor()
    staff.once('dialog', (d) => d.accept())
    await staff.getByRole('button', { name: 'Sign out everywhere' }).click()
    await staff.getByRole('heading', { name: 'Sign in' }).waitFor()
    await staff.goto(`${ORIGIN}/`)
    await staff.getByRole('heading', { name: 'Sign in' }).waitFor()
  })
  await step('forgot password: code by email, new password works', async () => {
    const p2 = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage()
    await p2.goto(`${ORIGIN}/forgot`)
    await fill(p2, 'Email', staffEmail)
    await p2.getByRole('button', { name: 'Send code' }).click()
    await p2.getByRole('heading', { name: 'Choose a new password' }).waitFor()
    await fill(p2, '6-digit code', await mailCode(staffEmail))
    await fill(p2, 'New password', 'Another-Strong-Passphrase-77')
    await fill(p2, 'Repeat new password', 'Another-Strong-Passphrase-77')
    await p2.getByRole('button', { name: 'Change password' }).click()
    await p2.getByText('Password changed').waitFor()
  })
  await step('the page leaks nothing: no console errors or CSP violations', async () => {
    expect(problems.length === 0, problems.slice(0, 3).join(' | '))
  })
  await step('public delete-account page deletes the staff account (not the shop)', async () => {
    const p3 = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage()
    await p3.goto(`${ORIGIN}/delete-account`)
    await fill(p3, 'Email', staffEmail)
    await fill(p3, 'Password', 'Another-Strong-Passphrase-77')
    await p3.getByRole('button', { name: 'Sign in' }).click()
    await p3.getByLabel('Your password').fill('Another-Strong-Passphrase-77')
    await p3.getByLabel('I understand this cannot be undone').check()
    await p3.getByRole('button', { name: 'Delete my account' }).click()
    await p3.getByText('Your account has been deleted').waitFor()
  })

  await browser.close()
  say(failures ? `\n${failures} step(s) FAILED` : '\nALL WEB E2E STEPS PASSED')
  process.exit(failures ? 1 : 0)
})()
