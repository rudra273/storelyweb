// Current-source localhost acceptance for payment methods, cash change, and post-save completion.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const origin = process.env.STORELY_WEB_ORIGIN || 'http://127.0.0.1:5173'
if (!['localhost', '127.0.0.1', 'app.storely.localhost'].includes(new URL(origin).hostname)) throw new Error('Localhost origin required')
if (!process.env.STORELY_FIXTURE) throw new Error('Run-owned STORELY_FIXTURE required')
const fixture = JSON.parse(fs.readFileSync(process.env.STORELY_FIXTURE, 'utf8'))

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

function parseMoneyPaise(text) {
  const cleaned = text.replace(/[₹,\s]/g, '')
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned)
  assert.ok(match, `Expected rupee amount, got ${text}`)
  return BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'))
}

function formatRupeesFromPaise(paise) {
  return rupees.format(Number(paise) / 100)
}

async function assertCompletionSummary(completion, expected) {
  await completion.getByRole('heading', { name: 'Invoice saved', exact: true }).waitFor()
  const rows = await completion.locator('.completion-figures > div').evaluateAll(els =>
    els.map(el => [
      el.querySelector('dt')?.textContent?.trim() ?? '',
      el.querySelector('dd')?.textContent?.trim() ?? '',
    ]),
  )
  assert.deepEqual(rows, expected)
}

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

    await page.goto(origin + '/billing/new')
    await page.getByLabel('Email', { exact: true }).fill(fixture.email)
    await page.getByLabel('Password', { exact: true }).fill(fixture.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    const scan = page.getByLabel('Scan barcode or search products', { exact: true })
    const quantity = page.getByLabel(`Quantity for ${original.name}`, { exact: true })
    const create = () => page.getByRole('button', { name: /^Create invoice/ })
    const billsPath = `/v1/shops/${fixture.shop_id}/bills`

    async function addFixtureProduct() {
      await scan.fill(original.name)
      await scan.press('Enter')
      await quantity.waitFor()
      await page.waitForFunction(() => {
        const btn = document.querySelector('.checkout-submit button')
        const total = document.querySelector('.grand-total dd')?.textContent?.trim()
        return !!btn && !btn.disabled && !!total && total !== '—'
      })
      assert.equal(await page.getByLabel('Paid in full', { exact: true }).isChecked(), false)
      assert.equal(await page.getByLabel('Part paid', { exact: true }).isChecked(), false)
      assert.equal(await page.getByLabel('Not paid yet', { exact: true }).isChecked(), false)
      return (await page.locator('.grand-total dd').textContent()).trim()
    }

    // Invoice 1: full cash checkout with counter-only change and New invoice continuation
    const totalText1 = await addFixtureProduct()
    const totalPaise1 = parseMoneyPaise(totalText1)
    await page.getByLabel('Paid in full', { exact: true }).check()
    await page.getByRole('combobox', { name: 'Paid by', exact: true }).selectOption({ label: 'Cash' })
    const cashDeltaPaise = 8250n
    const cashPaise = totalPaise1 + cashDeltaPaise
    const cashInput = (Number(cashPaise) / 100).toFixed(2)
    await page.getByLabel('Cash received', { exact: true }).fill(cashInput)
    const changeNotice = page.locator('.change-due')
    await changeNotice.waitFor()
    const expectedChange = formatRupeesFromPaise(cashDeltaPaise)
    assert.equal((await changeNotice.textContent()).trim(), `Change to return ${expectedChange}`)

    const save1 = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === billsPath)
    await create().click()
    const res1 = await save1
    assert.ok(res1.ok(), 'Full cash invoice created')
    const posted1 = res1.request().postDataJSON()
    assert.equal(posted1.payment.method, 'cash')
    assert.equal(posted1.payment.reference, null)
    assert.equal(Number(posted1.payment.amount), Number(totalPaise1) / 100)
    const detail1 = await res1.json()
    assert.equal(Number(detail1.bill.paid_amount), Number(detail1.bill.total_amount))
    assert.equal(Number(detail1.bill.balance_due), 0)

    const completion1 = page.locator('.completion')
    await assertCompletionSummary(completion1, [
      ['Total', totalText1],
      ['Received', totalText1],
      ['Balance', '₹0.00'],
    ])
    await completion1.getByText(detail1.bill.bill_number, { exact: true }).waitFor()
    await completion1.getByRole('button', { name: 'New invoice', exact: true }).click()

    await scan.waitFor()
    assert.equal(await quantity.count(), 0, 'Cart cleared after New invoice')
    await page.getByText('Scan or search to start this invoice', { exact: true }).waitFor()
    const draftAfterReset = await page.evaluate(shop => {
      const key = Object.keys(localStorage).find(k => k.startsWith('storely.draft.bill.') && k.endsWith(`.${shop}`))
      return key ? JSON.parse(localStorage.getItem(key))?.data ?? null : null
    }, fixture.shop_id)
    assert.equal(draftAfterReset, null, 'Local draft cleared on New invoice')

    // Invoice 2: partial bank-transfer checkout with reference, completion summary, and View invoice detail verification
    const totalText2 = await addFixtureProduct()
    const totalPaise2 = parseMoneyPaise(totalText2)
    const partialPaise = totalPaise2 / 2n
    assert.ok(partialPaise > 0n && partialPaise < totalPaise2, 'Fixture total must permit a partial amount')
    const partialInput = (Number(partialPaise) / 100).toFixed(2)
    const expectedReceived2 = formatRupeesFromPaise(partialPaise)
    const expectedDue2 = formatRupeesFromPaise(totalPaise2 - partialPaise)

    await page.getByLabel('Part paid', { exact: true }).check()
    await page.getByLabel('Paid now (₹)', { exact: true }).fill(partialInput)
    await page.getByRole('combobox', { name: 'Paid by', exact: true }).selectOption({ label: 'Bank transfer' })
    await page.getByLabel('Reference', { exact: true }).fill('NEFT-E023-01')
    await page.getByLabel('Keep this balance unassigned', { exact: true }).check()

    const save2 = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === billsPath)
    await create().click()
    const res2 = await save2
    assert.ok(res2.ok(), 'Partial bank transfer invoice created')
    const detail2 = await res2.json()
    assert.equal(Number(detail2.bill.paid_amount), Number(partialPaise) / 100)
    assert.equal(Number(detail2.bill.balance_due), Number(totalPaise2 - partialPaise) / 100)

    const completion2 = page.locator('.completion')
    await assertCompletionSummary(completion2, [
      ['Total', totalText2],
      ['Received', expectedReceived2],
      ['Balance due', expectedDue2],
    ])
    await completion2.getByText(detail2.bill.bill_number, { exact: true }).waitFor()
    await completion2.getByRole('link', { name: 'View invoice', exact: true }).click()
    await page.waitForURL(new RegExp(`/billing/${detail2.bill.uuid}$`))

    const amountsGroup = page.getByRole('group', { name: 'Amounts', exact: true })
    await amountsGroup.waitFor()
    const dueRow = amountsGroup.locator('div', { has: page.locator('dt', { hasText: /^Balance due$/ }) })
    assert.equal((await dueRow.locator('dd').textContent()).trim(), expectedDue2)

    const paymentsCard = page.locator('.invoice-records section', {
      has: page.locator('h2', { hasText: /^Payments$/ }),
    })
    await paymentsCard.waitFor()
    const paymentsText = await paymentsCard.textContent()
    assert.ok(paymentsText.includes('Bank transfer'), `Expected Bank transfer in payments: ${paymentsText}`)
    assert.ok(paymentsText.includes('NEFT-E023-01'), `Expected NEFT-E023-01 in payments: ${paymentsText}`)
    assert.ok(paymentsText.includes(expectedReceived2), `Expected ${expectedReceived2} in payments: ${paymentsText}`)

    process.stdout.write('PASS cash change, New invoice reset, partial Bank transfer with reference, completion summary, and detail verification\n')
  } finally { await browser.close() }
})().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1 })
