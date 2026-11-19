// Run-owned premium fixture only: tests actual stale edits against the local API.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs')
const assert = require('node:assert/strict')
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
    const auth = await context.request.post(origin + '/v1/auth/login', { data: { email: fixture.email, password: fixture.password, client: 'mobile' }, headers: { 'X-Requested-With': 'storely-web' } })
    assert.ok(auth.ok(), 'Fixture authentication')
    const headers = { authorization: `Bearer ${(await auth.json()).access_token}` }
    const productPath = `/v1/shops/${fixture.shop_id}/products/${fixture.product_uuid}`
    async function product() {
      const response = await context.request.get(origin + productPath, { headers })
      assert.ok(response.ok(), 'Read fixture product')
      return (await response.json()).product
    }
    async function remoteChange(value, body) {
      const response = await context.request.patch(origin + productPath, { headers, data: { ...body, expected_updated_at: value.updated_at } })
      assert.ok(response.ok(), 'Concurrent fixture edit')
      return (await response.json()).product
    }
    const original = await product()
    const writes = []
    page.on('request', request => {
      if (request.method() === 'PATCH' && new URL(request.url()).pathname === productPath) writes.push(request.postDataJSON())
    })
    await page.goto(origin + '/products')
    await page.getByLabel('Email', { exact: true }).fill(fixture.email)
    await page.getByLabel('Password', { exact: true }).fill(fixture.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('button', { name: `Edit ${original.name}`, exact: true }).click()
    await page.getByLabel(`Reorder level of ${original.name}`, { exact: true }).fill('7')
    const remote = await remoteChange(original, { selling_price: '125', price_mode: 'fixed' })
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByText(/Someone changed this product after you opened it/).waitFor()
    assert.equal(writes[0].expected_updated_at, original.updated_at)
    assert.equal(await page.getByLabel(`Reorder level of ${original.name}`, { exact: true }).inputValue(), '7')
    assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true)
    await page.getByRole('button', { name: 'Review latest product', exact: true }).click()
    await page.getByRole('button', { name: 'Keep my edits with latest product', exact: true }).click()
    assert.equal(Number(await page.getByLabel(`Price of ${original.name}`, { exact: true }).inputValue()), 125)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByText('Saved', { exact: true }).waitFor()
    const inlineResult = await product()
    assert.equal(Number(inlineResult.selling_price), 125)
    assert.equal(Number(inlineResult.reorder_level), 7)
    assert.deepEqual(writes[1], { reorder_level: '7', expected_updated_at: remote.updated_at })

    await page.goto(origin + `/products/${fixture.product_uuid}`)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit product', exact: true })
    await dialog.getByLabel('Product name', { exact: true }).fill(original.name + ' reviewed')
    const newer = await remoteChange(inlineResult, { selling_price: '130', reorder_level: '9', price_mode: 'fixed' })
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
    await dialog.getByText(/Someone changed this product after you opened it/).waitFor()
    assert.equal(await dialog.getByLabel('Product name', { exact: true }).inputValue(), original.name + ' reviewed')
    await dialog.getByRole('button', { name: 'Review latest product', exact: true }).click()
    await dialog.getByRole('button', { name: 'Keep my edits with latest product', exact: true }).click()
    assert.equal(Number(await dialog.getByLabel('Selling price (₹)', { exact: true }).inputValue()), 130)
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    const result = await product()
    assert.equal(result.name, original.name + ' reviewed')
    assert.equal(Number(result.selling_price), 130)
    assert.equal(Number(result.reorder_level), 9)
    assert.equal(writes[3].expected_updated_at, newer.updated_at)
    process.stdout.write('PASS actual inline/full stale edit rejection, retained entered values, explicit dirty-only rebase and remote-field preservation\n')
  } finally { await browser.close() }
})().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1 })
