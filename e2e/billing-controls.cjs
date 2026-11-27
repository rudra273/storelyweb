// E03.3A localhost browser acceptance: line discount, fixed doc discount, exclusive tax, up ₹5 round-off.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const origin = process.env.STORELY_WEB_ORIGIN || 'https://app.storely.localhost'
if (!['localhost', '127.0.0.1', 'app.storely.localhost'].includes(new URL(origin).hostname)) throw new Error('Localhost origin required')
if (!process.env.STORELY_FIXTURE) throw new Error('Run-owned STORELY_FIXTURE required')
const fixture = JSON.parse(fs.readFileSync(process.env.STORELY_FIXTURE, 'utf8'))

;(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  try {
    await page.goto(origin + '/billing/new')
    await page.getByLabel('Email', { exact: true }).fill(fixture.email)
    await page.getByLabel('Password', { exact: true }).fill(fixture.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    const scan = page.getByLabel('Scan barcode or search products', { exact: true })
    await scan.waitFor()
    await scan.fill(fixture.product_name)
    await scan.press('Enter')

    const qty = page.getByLabel(`Quantity for ${fixture.product_name}`, { exact: true })
    await qty.waitFor()
    await qty.fill('2')

    // Open per-line controls and set 10% line discount
    await page.getByRole('button', { name: `Line options for ${fixture.product_name}`, exact: true }).click()
    await page.getByLabel(`Discount type for ${fixture.product_name}`, { exact: true }).selectOption('percent')
    await page.getByLabel(`Discount for ${fixture.product_name}`, { exact: true }).fill('10')

    // Set document discount to fixed ₹10
    await page.getByLabel('Discount mode', { exact: true }).selectOption('amount')
    await page.getByLabel('Discount (₹)', { exact: true }).fill('10')

    // Set tax mode to exclusive
    await page.locator('label', { hasText: 'Tax mode' }).locator('select').selectOption('exclusive')

    // Set round-off mode to Up and increment to ₹5
    await page.locator('label', { hasText: /^Round-off/ }).first().locator('select').selectOption('up')
    await page.locator('label', { hasText: 'Round-off increment' }).locator('select').selectOption('5.00')

    // Wait for authoritative server preview to reflect ₹205.00
    await page.waitForFunction(() => {
      const total = document.querySelector('.grand-total dd')?.textContent?.trim() ?? ''
      const busy = document.querySelector('.checkout-totals')?.getAttribute('aria-busy')
      return busy === 'false' && total.includes('205')
    })

    // Select Paid in full and save
    await page.getByLabel('Paid in full', { exact: true }).check()
    const billsPath = `/v1/shops/${fixture.shop_id}/bills`
    const savePromise = page.waitForResponse(
      r => r.request().method() === 'POST' && new URL(r.url()).pathname === billsPath
    )
    await page.getByRole('button', { name: /^Create invoice/ }).click()
    const res = await savePromise
    assert.ok(res.ok(), `Expected 201 from POST /bills, got ${res.status()}`)
    const data = await res.json()
    const bill = data.bill
    const line = data.items[0]

    assert.equal(bill.subtotal_amount, '200.00')
    assert.equal(bill.discount_mode, 'amount')
    assert.equal(bill.discount_value, '10.00')
    assert.equal(bill.discount_amount, '30.00')
    assert.equal(bill.tax_mode, 'exclusive')
    assert.equal(bill.taxable_amount, '170.00')
    assert.equal(bill.cgst_amount, '15.30')
    assert.equal(bill.sgst_amount, '15.30')
    assert.equal(bill.igst_amount, '0.00')
    assert.equal(bill.round_off_mode, 'up')
    assert.equal(bill.round_off_increment, '5.00')
    assert.equal(bill.round_off_amount, '4.40')
    assert.equal(bill.total_amount, '205.00')
    assert.equal(line.discount_mode, 'percent')
    assert.equal(line.discount_value, '10.00')
    assert.equal(line.discount_amount, '20.00')

    process.stdout.write(`E03.3A web billing-controls acceptance PASSED: ${bill.bill_number} ${bill.total_amount}\n`)
  } finally {
    await browser.close()
  }
})().catch(err => {
  process.stderr.write(`${err?.stack || err}\n`)
  process.exit(1)
})
