// Disposable fixture: {a:{email,password}, b:{email,password}, shops:[{id,name},{id,name}]}.
// A owns both paid shops; B is staff in shop 1. Coordinator owns running and cleanup.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const origin = process.env.STORELY_WEB_ORIGIN || 'http://127.0.0.1:5173'
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Localhost origin required')
if (!process.env.STORELY_FIXTURE) throw new Error('Run-owned fixture required')
const fixture = JSON.parse(fs.readFileSync(process.env.STORELY_FIXTURE, 'utf8'))
;(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  const context = await browser.newContext({ ignoreHTTPSErrors: true, colorScheme: 'dark' })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('dialog', dialog => dialog.accept())
  try {
    const [shop1, shop2] = fixture.shops
    assert.ok(shop1.id && shop2.id)
    async function apiAccount(account) {
      const login = await context.request.post(origin + '/v1/auth/login', { data: { email: account.email, password: account.password, client: 'mobile' }, headers: { 'X-Requested-With': 'storely-web' } })
      assert.ok(login.ok(), 'Fixture authentication')
      const headers = { authorization: `Bearer ${(await login.json()).access_token}` }
      return async function theme(shop, value) {
        const path = `${origin}/v1/shops/${shop}/preferences/theme`
        const response = value === undefined ? await context.request.get(path, { headers }) : await context.request.put(path, { headers, data: { theme: value } })
        assert.ok(response.ok(), 'Read/write own workspace preference')
        return (await response.json()).theme
      }
    }
    const a = await apiAccount(fixture.a)
    const b = await apiAccount(fixture.b)
    await a(shop1.id, 'dark'); await a(shop2.id, 'system'); await b(shop1.id, 'light')
    await page.goto(origin + '/login')
    await page.getByLabel('Appearance', { exact: true }).selectOption('light')
    assert.equal(await page.evaluate(() => localStorage.getItem('storely.theme')), 'light')
    async function login(account) {
      await page.getByLabel('Email', { exact: true }).fill(account.email)
      await page.getByLabel('Password', { exact: true }).fill(account.password)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await page.locator('.account-toggle').waitFor()
    }
    async function appearance() {
      const input = page.getByLabel('Appearance', { exact: true })
      if (!(await input.isVisible())) await page.locator('.account-toggle').click()
      await input.waitFor()
      return input
    }
    async function selected(value) {
      await appearance()
      await page.waitForFunction(value => document.querySelector('.account-panel select')?.value === value, value)
    }
    async function choose(value, shop) {
      const response = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === `/v1/shops/${shop}/preferences/theme`)
      await (await appearance()).selectOption(value)
      const saved = await response
      assert.ok(saved.ok(), 'Appearance saved')
      assert.equal((await saved.json()).theme, value)
      await page.waitForFunction(() => ![...document.querySelectorAll('[role="status"]')].some(element => element.textContent.includes('Saving appearance')))
    }
    await login(fixture.a)
    await page.getByRole('combobox', { name: 'Shop', exact: true }).selectOption(shop1.id)
    await selected('dark')
    await page.goto(origin + '/billing/new')
    const draft = page.getByLabel('Scan barcode or search products', { exact: true })
    await draft.fill('unfinished scan')
    await selected('dark')
    await choose('light', shop1.id)
    assert.equal(await a(shop1.id), 'light')
    assert.equal(await draft.inputValue(), 'unfinished scan', 'Appearance does not remount checkout')
    let fail = true
    await page.route(`**/v1/shops/${shop1.id}/preferences/theme`, async route => {
      if (route.request().method() === 'PUT' && fail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unavailable', message: 'Injected outage' } }) })
      return route.continue()
    })
    await (await appearance()).selectOption('dark')
    await page.getByRole('button', { name: 'Retry appearance', exact: true }).waitFor()
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark')
    assert.equal(await a(shop1.id), 'light', 'Failed save did not change cloud preference')
    assert.equal(await draft.inputValue(), 'unfinished scan')
    fail = false
    const retry = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname.endsWith('/preferences/theme'))
    await page.getByRole('button', { name: 'Retry appearance', exact: true }).click()
    assert.ok((await retry).ok())
    await page.waitForFunction(() => !document.querySelector('.appearance [role="alert"]'))
    assert.equal(await a(shop1.id), 'dark')
    await choose('system', shop1.id)
    assert.equal(await a(shop1.id), 'system', 'System is explicitly stored')
    await choose('dark', shop1.id)
    await page.getByRole('combobox', { name: 'Shop', exact: true }).selectOption(shop2.id)
    await selected('system')
    await page.emulateMedia({ colorScheme: 'light' })
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light')
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark')
    assert.equal(await a(shop1.id), 'dark')
    assert.equal(await a(shop2.id), 'system')
    await page.getByRole('combobox', { name: 'Shop', exact: true }).selectOption(shop1.id)
    await selected('dark')
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await page.getByLabel('Email', { exact: true }).waitFor()
    assert.equal(await page.getByLabel('Appearance', { exact: true }).inputValue(), 'light', 'Guest choice stayed independent')
    let release
    let entered
    const ready = new Promise(resolve => { entered = resolve })
    const gate = new Promise(resolve => { release = resolve })
    await page.unroute(`**/v1/shops/${shop1.id}/preferences/theme`)
    await page.route(`**/v1/shops/${shop1.id}/preferences/theme`, async route => {
      if (route.request().method() === 'GET') { entered(); await gate }
      return route.continue()
    })
    await login(fixture.b)
    await ready
    await selected('system')
    assert.equal(await (await appearance()).inputValue(), 'system', 'New account never inherits A cached Dark')
    release()
    await selected('light')
    await choose('system', shop1.id)
    assert.equal(await b(shop1.id), 'system', 'Staff saves its own preference')
    assert.equal(await a(shop1.id), 'dark', 'Staff preference did not change owner preference')
    await choose('light', shop1.id)
    assert.equal(await page.evaluate(() => localStorage.getItem('storely.theme')), 'light')
    if (process.env.STORELY_ARTIFACT_DIR) {
      fs.mkdirSync(process.env.STORELY_ARTIFACT_DIR, { recursive: true })
      await page.screenshot({ path: `${process.env.STORELY_ARTIFACT_DIR}/workspace-theme.png`, fullPage: true })
    }
    process.stdout.write('PASS guest isolation; two shop/account scopes; saved server preference; explicit System/live media; preserved draft; failed-save retry; late account read and staff-owned preference\n')
  } finally { await browser.close() }
})().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1 })
