// Run only with a coordinator-owned disposable shop/product fixture; no broad data reset.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const origin = process.env.STORELY_WEB_ORIGIN || 'http://127.0.0.1:5173'
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Localhost origin required')
if (!process.env.STORELY_FIXTURE) throw new Error('Run-owned STORELY_FIXTURE required')
const fixture = JSON.parse(fs.readFileSync(process.env.STORELY_FIXTURE, 'utf8'))
const canonical = text => {
  assert.equal(typeof text, 'string')
  assert.match(text, /^[0-9]+(?:\.[0-9]+)?$/)
  const [integer, fraction = ''] = text.split('.')
  const tail = fraction.replace(/0+$/, '')
  return integer.replace(/^0+(?=[0-9])/, '') + (tail ? '.' + tail : '')
}
;(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  try {
    const auth = await context.request.post(origin + '/v1/auth/login', { data: { email: fixture.email, password: fixture.password, client: 'mobile' }, headers: { 'X-Requested-With': 'storely-web' } })
    assert.ok(auth.ok(), 'Fixture authentication')
    const headers = { authorization: `Bearer ${(await auth.json()).access_token}` }
    const base = `/v1/shops/${fixture.shop_id}`
    const settingsPath = base + '/invoice-settings'
    const productPath = base + '/products/' + fixture.product_uuid
    async function get(path) {
      const result = await context.request.get(origin + path, { headers })
      assert.ok(result.ok(), 'Read fixture endpoint')
      return result.json()
    }
    async function reorder(value) {
      const latest = (await get(productPath)).product
      const result = await context.request.patch(origin + productPath, { headers, data: { reorder_level: value, expected_updated_at: latest.updated_at } })
      assert.ok(result.ok(), 'Guarded reorder level change on fixture product')
    }
    const initialProduct = await get(productPath)
    assert.equal(canonical(initialProduct.product.quantity), '10', 'Fixture needs ten units')
    await reorder(null)
    const original = await get(settingsPath)
    const initialized = await context.request.patch(origin + settingsPath, { headers, data: { expected_revision: original.revision, low_stock_threshold: '8' } })
    assert.ok(initialized.ok(), 'Initialize fixture threshold')
    const writes = []
    page.on('request', request => { if (request.method() === 'PATCH' && new URL(request.url()).pathname === settingsPath) writes.push(request.postDataJSON()) })
    await page.goto(origin + '/settings')
    await page.getByLabel('Email', { exact: true }).fill(fixture.email)
    await page.getByLabel('Password', { exact: true }).fill(fixture.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('tab', { name: 'Shop details', exact: true }).click()
    const threshold = page.getByLabel('Default low-stock threshold', { exact: true })
    const save = page.getByRole('button', { name: 'Save settings', exact: true })
    await threshold.fill('10.00001')
    await page.getByRole('tab', { name: 'Pricing & tax', exact: true }).click()
    await save.click()
    await page.waitForFunction(() => document.getElementById('tab-shop')?.getAttribute('aria-selected') === 'true' && [...document.querySelectorAll('input')].some(input => input.value === '10.00001' && input.getAttribute('aria-invalid') === 'true'))
    assert.equal(await threshold.inputValue(), '10.00001')
    assert.equal(await threshold.evaluate(element => document.activeElement === element), true)
    assert.equal(writes.length, 0, 'Invalid threshold sends no PATCH')
    async function settingsPage() {
      await page.goto(origin + '/settings')
      await page.getByRole('tab', { name: 'Shop details', exact: true }).click()
    }
    async function setThreshold(value) {
      await threshold.fill(value)
      const response = page.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname === settingsPath)
      await save.click()
      const saved = await response
      assert.ok(saved.ok(), 'Save exact guarded threshold')
      const data = await saved.json()
      assert.equal(canonical(data.low_stock_threshold), value)
      assert.match(writes.at(-1).expected_revision, /^s1:\d+$/)
      await page.getByText(/Saved. Phones get the new layout/).waitFor()
      return data.low_stock_threshold
    }
    async function state(low) {
      const product = (await get(productPath)).product
      assert.equal(product.low_stock, low, 'Exact product low-stock boundary')
      const filtered = await get(base + '/products?low_stock=true&limit=100')
      assert.equal(filtered.items.some(item => item.uuid === fixture.product_uuid), low, 'Catalogue low-stock filter')
      const dashboard = await get(base + '/reports/kpis')
      const summary = await get(base + '/products/stock-summary')
      return { dashboard, summary }
    }
    const belowText = await setThreshold('9.9999')
    await page.reload()
    await page.getByRole('tab', { name: 'Shop details', exact: true }).click()
    assert.equal(await threshold.inputValue(), belowText, 'Exact threshold survives reload')
    const below = await state(false)
    await setThreshold('10')
    const equal = await state(true)
    assert.equal(equal.dashboard.low_stock_count, below.dashboard.low_stock_count + 1, 'Positive running-low dashboard count changes at equality')
    assert.equal(equal.summary.low, below.summary.low + 1)
    await page.goto(origin + '/products?low=1')
    await page.getByRole('button', { name: initialProduct.product.name, exact: true }).waitFor()
    await page.goto(origin + '/')
    await page.getByText(`${equal.dashboard.low_stock_count} running low · ${equal.dashboard.out_of_stock_count} out of stock`, { exact: true }).waitFor()
    await settingsPage()
    await setThreshold('0')
    const zero = await state(false)
    assert.equal(zero.dashboard.low_stock_count, below.dashboard.low_stock_count)
    await setThreshold('10')
    await reorder('0')
    await state(false) // A product's explicit zero overrides the shop default.
    await reorder(null)
    await state(true)
    const final = await get(productPath)
    assert.equal(canonical(final.product.quantity), '10')
    assert.equal(final.movements.length, initialProduct.movements.length, 'Settings/reorder changes post no stock movements')
    if (process.env.STORELY_ARTIFACT_DIR) {
      fs.mkdirSync(process.env.STORELY_ARTIFACT_DIR, { recursive: true })
      await page.screenshot({ path: `${process.env.STORELY_ARTIFACT_DIR}/low-stock-settings.png`, fullPage: true })
    }
    process.stdout.write('PASS invalid threshold no PATCH/focus; exact reload; stock10 below/equal boundary; catalog/dashboard counts; shop zero and product zero override; no stock postings\n')
  } finally { await browser.close() }
})().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1 })
