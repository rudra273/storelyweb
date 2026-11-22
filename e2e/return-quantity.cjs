// Real local API/UI acceptance. Coordinator owns disposable fixture cleanup.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const origin = process.env.STORELY_WEB_ORIGIN || 'http://127.0.0.1:5173'
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Local origin required')
if (!process.env.STORELY_FIXTURE) throw new Error('Disposable fixture required')
const fixture = JSON.parse(fs.readFileSync(process.env.STORELY_FIXTURE, 'utf8'))
;(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    const login = await context.request.post(origin + '/v1/auth/login', { data: { email: fixture.email, password: fixture.password, client: 'mobile' } })
    assert.ok(login.ok())
    const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
    const base = `/v1/shops/${fixture.shop_id}`
    async function post(path, data) {
      const reply = await context.request.post(origin + base + path, { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data })
      assert.ok(reply.ok(), `${path}: ${reply.status()}`)
      return reply.json()
    }
    const input = { items: [{ name: 'Return fraction fixture', quantity: '2', unit_price: '100', gst_percent: '0' }] }
    const priced = await post('/bills/preview', input)
    const invoice = await post('/bills', { ...input, settlement_choice: 'full', reviewed_context: priced.reviewed_context, payment: { amount: priced.total, method: 'cash' } })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    await page.goto(origin + '/login')
    await page.getByLabel('Email', { exact: true }).fill(fixture.email)
    await page.getByLabel('Password', { exact: true }).fill(fixture.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('heading', { name: 'Hello', exact: false }).waitFor()
    await page.goto(origin + '/billing/' + invoice.bill.uuid)
    await page.getByRole('button', { name: 'Return items', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const quantity = dialog.getByLabel('Return Return fraction fixture', { exact: true })
    await dialog.getByText(/can return 2/).waitFor()
    let requests = 0
    page.on('request', request => { if (request.method() === 'POST' && /\/credit-note(?:\/preview)?$/.test(new URL(request.url()).pathname)) requests++ })
    for (const raw of ['1.2345', '2.001', '1e0', '-1']) {
      await quantity.fill(raw)
      const before = requests
      await page.waitForTimeout(400)
      assert.equal(await quantity.inputValue(), raw)
      assert.equal(await quantity.getAttribute('aria-invalid'), 'true')
      assert.equal(await dialog.getByRole('button', { name: 'Return items', exact: true }).isDisabled(), true)
      assert.equal(requests, before)
    }
    await quantity.fill('0.0000')
    assert.equal(await dialog.getByRole('button', { name: 'Return items', exact: true }).isDisabled(), true)
    await quantity.fill('0.5000')
    await dialog.getByLabel('Reason for the return', { exact: true }).fill('Fractional fixture return')
    await page.waitForFunction(() => { const button = [...document.querySelectorAll('dialog button')].find(button => button.textContent === 'Return items'); return button && !button.disabled })
    const savedReply = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/credit-note') && response.request().method() === 'POST')
    await dialog.getByRole('button', { name: 'Return items', exact: true }).click()
    const saved = await savedReply
    assert.ok(saved.ok())
    assert.deepEqual(saved.request().postDataJSON().quantities, { [invoice.items[0].uuid]: '0.5' })
    await page.goto(origin + '/billing/' + invoice.bill.uuid)
    await page.getByRole('button', { name: 'Return items', exact: true }).click()
    await page.getByRole('dialog').getByText(/can return 1.5/).waitFor()
    process.stdout.write('PASS real fractional return: invalid requests blocked, normalized 0.5 saved, remaining 1.5 confirmed\n')
  } finally { await browser.close() }
})().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1 })
