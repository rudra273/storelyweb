// Coordinator-supplied isolated premium fixture only. Creates one intended payment.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const origin = process.env.STORELY_WEB_ORIGIN || 'http://localhost:5173'
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Current-source localhost required')
if (!process.env.STORELY_FIXTURE) throw new Error('Run-owned fixture required')
const fixture = JSON.parse(fs.readFileSync(process.env.STORELY_FIXTURE, 'utf8'))

;(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  try {
    const login = await context.request.post(origin + '/v1/auth/login', { data: { email: fixture.email, password: fixture.password, client: 'mobile' }, headers: { 'X-Requested-With': 'storely-web' } })
    assert.ok(login.ok(), 'Fixture login')
    const token = (await login.json()).access_token
    const headers = { authorization: `Bearer ${token}` }
    const base = `/v1/shops/${fixture.shop_id}/suppliers/${fixture.supplier_uuid}`
    async function statement() {
      const response = await context.request.get(origin + base + '/statement', { headers })
      assert.ok(response.ok(), 'Fixture statement')
      return response.json()
    }
    const before = await statement()
    const previousOtherDue = before.purchases.find(row => row.uuid === fixture.other_purchase_uuid).balance_due
    await page.goto(origin + `/suppliers/${fixture.supplier_uuid}`)
    await page.getByLabel('Email', { exact: true }).fill(fixture.email)
    await page.getByLabel('Password', { exact: true }).fill(fixture.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('button', { name: `Pay invoice ${fixture.invoice_number}`, exact: true }).click()
    let dialog = page.getByRole('dialog', { name: `Pay ${fixture.supplier_name}`, exact: true })
    await dialog.getByLabel('Amount (₹)', { exact: true }).fill('25.50')
    const writes = []
    let committed
    await page.route(`**${base}/payments`, async route => {
      if (route.request().method() !== 'POST') return route.continue()
      const body = route.request().postDataJSON()
      writes.push(body)
      if (writes.length === 1) {
        assert.equal(body.purchase_uuid, fixture.purchase_uuid)
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.startsWith('storely.supplier-payment:')))))
        assert.deepEqual(stored, body, 'Exact target/body stored before POST')
        const response = await route.fetch()
        assert.ok(response.ok(), 'First payment commits')
        committed = await response.json()
        return route.abort('failed')
      }
      return route.continue()
    })
    await page.evaluate(() => {
      window.supplierStorageWrite = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('storely.supplier-payment:')) throw new DOMException('Quota', 'QuotaExceededError')
        return window.supplierStorageWrite.call(this, key, value)
      }
    })
    await dialog.getByRole('button', { name: 'Record payment', exact: true }).click()
    await dialog.getByText(/This attempt was not sent/).waitFor()
    assert.equal(writes.length, 0)
    await page.evaluate(() => { Storage.prototype.setItem = window.supplierStorageWrite })
    await dialog.getByRole('button', { name: 'Record payment', exact: true }).click()
    await dialog.getByRole('button', { name: 'Retry payment', exact: true }).waitFor()
    await page.reload()
    // Reopen through general account payment rather than the original purchase action.
    await page.getByRole('button', { name: 'Record payment', exact: true }).click()
    dialog = page.getByRole('dialog', { name: `Pay ${fixture.supplier_name}`, exact: true })
    assert.equal(await dialog.getByLabel('Amount (₹)', { exact: true }).isDisabled(), true)
    assert.equal(await dialog.getByLabel('Amount (₹)', { exact: true }).inputValue(), '25.50')
    assert.equal(await dialog.getByRole('link', { name: 'Review its original purchase' }).getAttribute('href'), `/purchases/${fixture.purchase_uuid}`)
    await dialog.getByRole('button', { name: 'Retry payment', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.deepEqual(writes[1], writes[0], 'Retry keeps selected target/request key and every field')
    const after = await statement()
    assert.equal(after.payments.length, before.payments.length + 1)
    const payment = after.payments.find(row => row.uuid === committed.uuid)
    assert.equal(payment.allocations.length, 1)
    assert.equal(payment.allocations[0].purchase_uuid, fixture.purchase_uuid)
    assert.equal(Number(after.purchases.find(row => row.uuid === fixture.purchase_uuid).balance_due), 74.50)
    assert.equal(after.purchases.find(row => row.uuid === fixture.other_purchase_uuid).balance_due, previousOtherDue)
    process.stdout.write('PASS supplier storage-block no send, selected purchase committed/lost-response reload, exact retry and one payment allocated only to original target\n')
  } finally { await browser.close() }
})().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1 })
