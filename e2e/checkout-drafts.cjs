// Localhost-only acceptance using a disposable premium account and product.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const origin = process.env.STORELY_WEB_ORIGIN || 'http://127.0.0.1:5173'
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Localhost origin required')
if (!process.env.STORELY_FIXTURE) throw new Error('Run-owned STORELY_FIXTURE required')
const fixture = JSON.parse(fs.readFileSync(process.env.STORELY_FIXTURE, 'utf8'))
const artifacts = process.env.STORELY_ARTIFACT_DIR || '/tmp/storely-e02-drafts-browser'
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
    assert.ok(login.ok())
    const headers = { authorization: `Bearer ${(await login.json()).access_token}` }
    const productUrl = `${origin}/v1/shops/${fixture.shop_id}/products/${fixture.product_uuid}`
    const stock = async () => {
      const response = await context.request.get(productUrl, { headers })
      assert.ok(response.ok())
      return (await response.json()).product
    }
    const product = await stock()
    await page.goto(origin + '/billing/new')
    await page.getByLabel('Email', { exact: true }).fill(fixture.email)
    await page.getByLabel('Password', { exact: true }).fill(fixture.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    const quantity = page.getByLabel(`Quantity for ${product.name}`, { exact: true })
    const amount = page.getByLabel('Paid now (₹)', { exact: true })
    const hold = page.getByRole('button', { name: 'Hold invoice', exact: true })
    const heldList = page.getByRole('region', { name: /^Held invoices/ })
    const held = name => heldList.getByRole('listitem').filter({ hasText: name })
    const create = page.getByRole('button', { name: /^Create invoice/ })
    async function add(name) {
      const search = page.getByLabel('Scan barcode or search products', { exact: true })
      await search.fill(product.name)
      await search.press('Enter')
      await quantity.waitFor()
      await page.getByRole('button', { name: 'Add customer', exact: true }).click()
      await page.getByLabel('Name', { exact: true }).fill(name)
      await page.getByRole('button', { name: 'Done', exact: true }).click()
    }
    await add('Draft One')
    await page.waitForFunction(() => /118/.test(document.querySelector('.checkout-submit button')?.textContent || ''))
    await page.getByLabel('Part paid', { exact: true }).check()
    await amount.fill('50.001')
    await page.getByRole('group', { name: 'Payment' }).getByRole('combobox').selectOption('upi')
    await page.getByLabel('Reference', { exact: true }).fill('draft-reference')
    const key = `storely.draft.bill.${fixture.user_id || ''}`
    await page.waitForFunction(({ key, shop }) => Object.keys(localStorage).some(k => k.startsWith(key) && k.endsWith(`.${shop}`) && localStorage.getItem(k).includes('draft-reference')), { key, shop: fixture.shop_id })
    process.stdout.write('Checking active draft reload\n')
    await page.reload()
    await page.getByText('Draft One', { exact: true }).waitFor()
    assert.equal(await amount.inputValue(), '50.001')
    assert.equal(await page.getByLabel('Reference', { exact: true }).inputValue(), 'draft-reference')
    await page.evaluate(() => {
      window.originalDraftSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('storely.draft.bill.') && JSON.parse(value).held?.length) {
          throw new DOMException('Acceptance fixture storage failure', 'QuotaExceededError')
        }
        return window.originalDraftSetItem.call(this, key, value)
      }
    })
    await hold.click()
    await page.getByText(/could not be saved in this browser/).waitFor()
    assert.equal(await amount.inputValue(), '50.001', 'A failed hold keeps the active checkout')
    await page.evaluate(() => { Storage.prototype.setItem = window.originalDraftSetItem })
    await hold.click()
    await held('Draft One').waitFor()
    await quantity.waitFor({ state: 'hidden' })
    await add('Draft Two')
    await quantity.fill('2')
    process.stdout.write('Checking atomic resume and swap\n')
    await held('Draft One').getByRole('button', { name: 'Resume held invoice' }).click()
    await held('Draft Two').waitFor()
    await page.getByText('Draft One', { exact: true }).waitFor()
    assert.equal(await quantity.inputValue(), '1')
    assert.equal(await amount.inputValue(), '50.001')
    process.stdout.write('Checking swapped draft reload\n')
    await page.reload()
    await held('Draft Two').waitFor()
    assert.equal(await amount.inputValue(), '50.001')
    await page.screenshot({ path: `${artifacts}/restored-and-held.png`, fullPage: true })
    assert.equal(Number((await stock()).quantity), Number(product.quantity), 'Draft transitions post no stock')
    await amount.fill('50')
    await page.getByLabel('Keep this balance unassigned', { exact: true }).check()
    const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/v1/shops/${fixture.shop_id}/bills`)
    await create.click()
    const saved = await response
    assert.ok(saved.ok(), 'Resumed invoice posts')
    const { bill } = await saved.json()
    assert.equal(bill.customer_name, 'Draft One')
    assert.equal(Number(bill.paid_amount), 50)
    assert.equal(Number(bill.balance_due), 68)
    await page.getByText(bill.bill_number, { exact: true }).first().waitFor()
    await page.goto(origin + '/billing/new')
    await held('Draft Two').waitFor()
    assert.equal(await held('Draft One').count(), 0, 'Consumed draft is not in held list')
    assert.equal(Number((await stock()).quantity), Number(product.quantity) - 1)
    process.stdout.write('PASS raw checkout reload, failed-hold retention, atomic hold and swap, resumed save, held preservation and one stock deduction\n')
  } finally { await browser.close() }
})().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1 })
