// Localhost acceptance using a disposable shop/product supplied by the coordinator.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const origin = process.env.STORELY_WEB_ORIGIN || 'http://127.0.0.1:5173'
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Localhost origin required')
if (!process.env.STORELY_FIXTURE) throw new Error('Run-owned STORELY_FIXTURE required')
const fixture = JSON.parse(fs.readFileSync(process.env.STORELY_FIXTURE, 'utf8'))
const initialCode = 'CHECKOUT-MISSING-102'
const correctedBarcode = 'CHECKOUT-CORRECTED-103'

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
    assert.ok(login.ok())
    const headers = { authorization: `Bearer ${(await login.json()).access_token}` }
    const productsPath = `/v1/shops/${fixture.shop_id}/products`
    const originalResponse = await context.request.get(`${origin}${productsPath}/${fixture.product_uuid}`, { headers })
    assert.ok(originalResponse.ok())
    const original = (await originalResponse.json()).product
    await page.goto(origin + '/billing/new')
    await page.getByLabel('Email', { exact: true }).fill(fixture.email)
    await page.getByLabel('Password', { exact: true }).fill(fixture.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    const scan = page.getByLabel('Scan barcode or search products', { exact: true })
    async function scanCode(code) { await scan.fill(code); await scan.press('Enter') }
    const originalQuantity = page.getByLabel(`Quantity for ${original.name}`, { exact: true })
    await scanCode(original.name)
    await originalQuantity.waitFor()
    await originalQuantity.fill('2')
    await page.getByRole('button', { name: 'Add customer', exact: true }).click()
    await page.getByLabel('Name', { exact: true }).fill('Product entry customer')
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    const discount = page.getByLabel('Discount (%)', { exact: true })
    await discount.fill('10')
    await page.waitForFunction(() => document.querySelector('.checkout-submit button')?.textContent.includes('212'))
    await page.getByLabel('Part paid', { exact: true }).check()
    const partial = page.getByLabel('Paid now (₹)', { exact: true })
    await partial.fill('50.001')
    const createProduct = page.getByRole('button', { name: 'Create product with this barcode', exact: true })
    const editor = page.getByRole('dialog', { name: 'Add product', exact: true })
    await scanCode(initialCode)
    await createProduct.click()
    await editor.waitFor()
    const barcode = editor.getByLabel('Barcode', { exact: false }).filter({ visible: true })
    assert.equal(await barcode.inputValue(), initialCode)
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
    await editor.waitFor({ state: 'hidden' })
    assert.equal(await originalQuantity.inputValue(), '2')
    assert.equal(await partial.inputValue(), '50.001')
    if (!await createProduct.isVisible()) await scanCode(initialCode)
    await createProduct.click()
    await editor.waitFor()
    await editor.getByLabel('Product name', { exact: false }).fill('Checkout catalog addition')
    await editor.getByLabel('Selling price (₹)', { exact: false }).fill('20')
    await editor.getByLabel('Opening stock', { exact: false }).fill('3')
    await barcode.fill(correctedBarcode)
    const productSave = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === productsPath)
    let oldCodeLookups = 0
    page.on('request', req => {
      const url = new URL(req.url())
      if (url.pathname === `${productsPath}/lookup` && url.searchParams.get('code') === initialCode) oldCodeLookups++
    })
    await editor.getByRole('button', { name: 'Add product', exact: true }).click()
    const response = await productSave
    assert.ok(response.ok(), 'Product creation accepted')
    const { product } = await response.json()
    assert.equal(product.barcode, correctedBarcode)
    await editor.waitFor({ state: 'hidden' })
    assert.equal(await page.getByLabel('Quantity for Checkout catalog addition', { exact: true }).inputValue(), '1')
    assert.equal(await originalQuantity.inputValue(), '2')
    assert.equal(await discount.inputValue(), '10')
    await page.getByText('Product entry customer', { exact: true }).waitFor()
    await page.getByText(/Review the updated invoice amounts and choose how the customer paid again/).waitFor()
    await page.getByLabel('Part paid', { exact: true }).check()
    assert.equal(await partial.inputValue(), '50.001')
    assert.equal(oldCodeLookups, 0, 'The original scanned code does not identify the saved product')
    const accountDraft = await page.evaluate(shop => Object.keys(localStorage).find(k => k.startsWith('storely.draft.bill.') && k.endsWith(`.${shop}`)), fixture.shop_id)
    await page.waitForFunction(({ key, uuid }) => JSON.parse(localStorage.getItem(key)).data.items.some(row => row.product.uuid === uuid), { key: accountDraft, uuid: product.uuid })
    await page.reload()
    assert.equal(await page.getByLabel('Quantity for Checkout catalog addition', { exact: true }).inputValue(), '1')
    assert.equal(await originalQuantity.inputValue(), '2')
    const stock = await context.request.get(`${origin}${productsPath}/${product.uuid}`, { headers })
    assert.ok(stock.ok())
    assert.equal(Number((await stock.json()).product.quantity), 3, 'Returning from catalog does not post a sale')
    process.stdout.write('PASS prefilled code, cancelled editor preserves work, edited barcode adds exact saved product once, raw checkout and returned cart survive reload\n')
  } finally { await browser.close() }
})().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1 })
