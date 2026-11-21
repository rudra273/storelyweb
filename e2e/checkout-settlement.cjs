// Current-source localhost acceptance; only a coordinator-owned disposable fixture.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const origin = process.env.STORELY_WEB_ORIGIN || 'http://127.0.0.1:5173'
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Localhost origin required')
if (!process.env.STORELY_FIXTURE) throw new Error('Run-owned STORELY_FIXTURE required')
const fixture = JSON.parse(fs.readFileSync(process.env.STORELY_FIXTURE, 'utf8'))
const artifacts = process.env.STORELY_ARTIFACT_DIR || '/tmp/storely-e02-checkout-browser'
fs.mkdirSync(artifacts, { recursive: true })

;(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  try {
    const login = await context.request.post(origin + '/v1/auth/login', {
      data: { email: fixture.email, password: fixture.password, client: 'mobile' },
      headers: { 'X-Requested-With': 'storely-web' },
    })
    assert.ok(login.ok(), 'Fixture authentication')
    const headers = { authorization: `Bearer ${(await login.json()).access_token}` }
    const productUrl = `${origin}/v1/shops/${fixture.shop_id}/products/${fixture.product_uuid}`
    const originalResponse = await context.request.get(productUrl, { headers })
    assert.ok(originalResponse.ok())
    const original = (await originalResponse.json()).product
    assert.equal(Number(original.selling_price), 118, 'Shared reviewed fixture total is118')
    await page.goto(origin + '/billing/new')
    await page.getByLabel('Email', { exact: true }).fill(fixture.email)
    await page.getByLabel('Password', { exact: true }).fill(fixture.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    let sent = 0
    const postedKeys = []
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === `/v1/shops/${fixture.shop_id}/bills`) { sent++; postedKeys.push(request.headers()['idempotency-key']) }
    })
    const create = () => page.getByRole('button', { name: /^Create invoice/ })
    const consent = () => page.getByLabel('Keep this balance unassigned', { exact: true })
    async function add() {
      const search = page.getByLabel('Scan barcode or search products', { exact: true })
      await search.fill(original.name)
      await search.press('Enter')
      await page.getByLabel(`Quantity for ${original.name}`, { exact: true }).waitFor()
      await page.waitForFunction(() => /118/.test(document.querySelector('.checkout-submit button')?.textContent || ''))
      assert.equal(await page.getByLabel('Paid in full', { exact: true }).isChecked(), false)
      assert.equal(await page.getByLabel('Part paid', { exact: true }).isChecked(), false)
      assert.equal(await page.getByLabel('Not paid yet', { exact: true }).isChecked(), false)
    }
    async function save(expectedPaid, expectedDue) {
      const completed = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/v1/shops/${fixture.shop_id}/bills`)
      await create().click()
      const response = await completed
      assert.ok(response.ok(), 'Invoice committed')
      const detail = await response.json()
      assert.equal(Number(detail.bill.total_amount), 118)
      assert.equal(Number(detail.bill.paid_amount), expectedPaid)
      assert.equal(Number(detail.bill.balance_due), expectedDue)
      await page.getByText(detail.bill.bill_number, { exact: true }).first().waitFor()
      return detail
    }
    await add()
    await create().click()
    await page.getByText('Choose how the customer paid: in full, part or not yet.').waitFor()
    assert.equal(sent, 0, 'No implicit payment selection')
    await page.getByLabel('Part paid', { exact: true }).check()
    const amount = page.getByLabel('Paid now (₹)', { exact: true })
    for (const invalid of ['0', '-1', '118', '119', '50.001']) {
      await amount.fill(invalid)
      await consent().check()
      await create().click()
      await page.getByText(/Enter the amount paid now:/).waitFor()
      assert.equal(sent, 0, `Invalid partial ${invalid} cannot post`)
    }
    await amount.fill('50')
    assert.equal(await consent().isChecked(), false, 'Changing settlement resets prior consent')
    assert.equal(await create().isDisabled(), true, 'Unassigned credit requires consent')
    await consent().check()
    await page.screenshot({ path: `${artifacts}/partial-reviewed.png`, fullPage: true })
    await save(50, 68)
    await page.goto(origin + '/billing/new')
    await add()
    await page.getByLabel('Paid in full', { exact: true }).check()
    await save(118, 0)
    await page.goto(origin + '/billing/new')
    await add()
    await page.getByLabel('Not paid yet', { exact: true }).check()
    assert.equal(await create().isDisabled(), true)
    await consent().check()
    await page.screenshot({ path: `${artifacts}/unpaid-reviewed.png`, fullPage: true })
    await save(0, 118)
    assert.equal(sent, 3, 'Exactly three deliberate settlements posted')
    await page.goto(origin + '/billing/new')
    await add()
    await page.getByLabel('Paid in full', { exact: true }).check()
    let changed = false
    await page.route(`**/v1/shops/${fixture.shop_id}/bills`, async route => {
      if (route.request().method() !== 'POST' || changed) return route.continue()
      changed = true
      const settingsUrl = `${origin}/v1/shops/${fixture.shop_id}/invoice-settings`
      const settingsResponse = await context.request.get(settingsUrl, { headers })
      assert.ok(settingsResponse.ok())
      const settings = await settingsResponse.json()
      const updated = await context.request.patch(settingsUrl, {
        headers, data: { expected_revision: settings.revision, footer_text: 'Checkout review changed by isolated test' },
      })
      assert.ok(updated.ok(), 'Intervening settings update')
      return route.continue()
    })
    const staleResponse = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/v1/shops/${fixture.shop_id}/bills`)
    await create().click()
    const stale = await staleResponse
    assert.equal(stale.status(), 409)
    assert.equal((await stale.json()).error.code, 'checkout_changed')
    await page.getByText(/Review the updated invoice amounts and choose how the customer paid again/).waitFor()
    assert.equal(await page.getByLabel('Paid in full', { exact: true }).isChecked(), false)
    await page.getByLabel('Paid in full', { exact: true }).check()
    await page.screenshot({ path: `${artifacts}/latest-review.png`, fullPage: true })
    await save(118, 0)
    assert.equal(sent, 5, 'One stale rejection and four accepted invoices')
    assert.notEqual(postedKeys[3], postedKeys[4], 'Definitive no-effect rejection permits a new reviewed identity')
    const stock = await context.request.get(productUrl, { headers })
    assert.ok(stock.ok())
    assert.equal(Number((await stock.json()).product.quantity), Number(original.quantity) - 4)
    process.stdout.write('PASS explicit selection, strict partial bounds, consent reset, full/partial/unpaid posted totals, stale reviewed context rejection/reselection and stock\n')
  } finally { await browser.close() }
})().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1 })
