// Localhost-only real invoice recovery check. The coordinator supplies an isolated
// premium fixture JSON (email/password/shop_id/product_uuid), then removes its shop/account.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const origin = process.env.STORELY_WEB_ORIGIN || 'http://localhost:5173'
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Current-source localhost origin required')
if (!process.env.STORELY_FIXTURE) throw new Error('STORELY_FIXTURE must identify a run-owned premium fixture')
const fixture = JSON.parse(fs.readFileSync(process.env.STORELY_FIXTURE, 'utf8'))

;(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  try {
    const auth = await context.request.post(origin + '/v1/auth/login', {
      data: { email: fixture.email, password: fixture.password, client: 'mobile' },
      headers: { 'X-Requested-With': 'storely-web' },
    })
    assert.ok(auth.ok(), 'Fixture authentication')
    const token = (await auth.json()).access_token
    const apiHeaders = { authorization: `Bearer ${token}` }
    const productResponse = await context.request.get(`${origin}/v1/shops/${fixture.shop_id}/products/${fixture.product_uuid}`, { headers: apiHeaders })
    assert.ok(productResponse.ok(), 'Fixture product')
    const product = (await productResponse.json()).product
    await page.goto(origin + '/billing/new')
    await page.getByLabel('Email', { exact: true }).fill(fixture.email)
    await page.getByLabel('Password', { exact: true }).fill(fixture.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    const search = page.getByLabel('Scan barcode or search products', { exact: true })
    await search.fill(product.name)
    await search.press('Enter')
    await page.getByLabel(`Quantity for ${product.name}`, { exact: true }).waitFor()
    await page.getByLabel('Paid in full', { exact: false }).check()
    const create = page.getByRole('button', { name: /^Create invoice/ })
    await create.waitFor()
    const requests = []
    let committed
    await page.route(`**/v1/shops/${fixture.shop_id}/bills`, async route => {
      if (route.request().method() !== 'POST') return route.continue()
      const request = route.request()
      requests.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() })
      if (requests.length === 1) {
        const durable = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('storely.draft.bill.')))).data.attempt)
        assert.deepEqual(durable, { key: requests[0].key, body: requests[0].body })
        const response = await route.fetch()
        assert.ok(response.ok(), 'First invoice committed')
        committed = await response.json()
        return route.abort('failed') // Deliberately lose the response after the real commit.
      }
      if (requests.length === 2 || requests.length === 3) {
        return route.fulfill({ status: requests.length === 2 ? 422 : 409, contentType: 'application/json', body: JSON.stringify({ error: { code: requests.length === 2 ? 'bad_quantity' : 'overpayment', message: 'Injected retry validation rejection' } }) })
      }
      return route.continue()
    })
    await page.evaluate(() => {
      window.invoiceStorageWrite = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('storely.draft.bill.') && JSON.parse(value).data.attempt) throw new DOMException('Injected quota', 'QuotaExceededError')
        return window.invoiceStorageWrite.call(this, key, value)
      }
    })
    await create.click()
    await page.getByText(/This attempt has not been sent/).waitFor()
    assert.equal(requests.length, 0, 'Storage-blocked invoice cannot reach API')
    await page.evaluate(() => { Storage.prototype.setItem = window.invoiceStorageWrite })
    await create.click()
    await page.getByRole('button', { name: 'Retry saving invoice', exact: true }).waitFor()
    assert.equal(requests.length, 1)
    await page.reload()
    await page.getByText(/was not confirmed before this page closed/).waitFor()
    assert.equal(await page.getByLabel(`Quantity for ${product.name}`, { exact: true }).isDisabled(), true)
    for (let index = 1; index <= 2; index++) {
      await page.getByRole('button', { name: 'Retry saving invoice', exact: true }).click()
      await page.getByText(/Injected retry validation rejection/).waitFor()
      await page.waitForFunction(() => !document.querySelector('.checkout-submit button').disabled)
      assert.equal(requests.length, index + 1)
      assert.deepEqual(requests[index], requests[0], 'Validation rejection retry retains exact key/body')
      assert.equal(await page.getByLabel(`Quantity for ${product.name}`, { exact: true }).isDisabled(), true)
      const frozen = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('storely.draft.bill.')))).data.attempt)
      assert.deepEqual(frozen, { key: requests[0].key, body: requests[0].body })
      await page.reload()
      await page.getByText(/was not confirmed before this page closed/).waitFor()
    }
    await page.getByRole('button', { name: 'Retry saving invoice', exact: true }).click()
    await page.getByText(committed.bill.bill_number, { exact: true }).first().waitFor()
    assert.equal(requests.length, 4)
    assert.deepEqual(requests[3], requests[0], 'Reload retry reuses exact key/body')
    const final = await context.request.get(`${origin}/v1/shops/${fixture.shop_id}/bills/${committed.bill.uuid}`, { headers: apiHeaders })
    assert.ok(final.ok())
    const stock = await context.request.get(`${origin}/v1/shops/${fixture.shop_id}/products/${fixture.product_uuid}`, { headers: apiHeaders })
    assert.equal(Number((await stock.json()).product.quantity), Number(product.quantity) - 1, 'Lost response retry consumes stock exactly once')
    process.stdout.write('PASS storage-blocked send, persisted request-before-network, committed/lost-response reload,422/409 frozen retry and identical final replay with one stock deduction\n')
  } finally { await browser.close() }
})().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1 })
