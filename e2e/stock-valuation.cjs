// Real browser/API/export acceptance of the independently authored E03 fixture.
// Coordinator provisions and cleans the isolated shops. Never targets the demo.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const crypto = require('node:crypto')
const path = require('node:path')
const origin = process.env.STORELY_WEB_ORIGIN || 'http://localhost:5173'
if (!['localhost', '127.0.0.1', 'app.storely.localhost'].includes(new URL(origin).hostname)) throw new Error('Local origin required')
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value))
const qty = value => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 }).format(Number(value))
const csvRows = text => text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(line => line.split(',').map(cell => cell.replace(/^"|"$/g, '').replace(/""/g, '"')))

;(async () => {
  const fixturePath = process.env.STORELY_VALUATION_CONTRACT || path.resolve(__dirname, '../../storelyapi/tests/fixtures/stock_valuation_contract_v1.json')
  const fixtureBytes = await fs.readFile(fixturePath)
  const contract = JSON.parse(fixtureBytes)
  const fixture = JSON.parse(await fs.readFile(process.env.STORELY_VALUATION_SEED || '/tmp/storely-valuation-fixture.json', 'utf8'))
  assert.equal(fixture.shops.length, contract.cases.length)
  const browser = await chromium.launch({ ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  const results = []
  try {
    for (const shop of fixture.shops) {
      const expected = contract.cases.find(item => item.id === shop.case_id)?.expected
      assert.ok(expected, 'Unknown case')
      const context = await browser.newContext({ ignoreHTTPSErrors: true })
      try {
        const page = await context.newPage()
        page.setDefaultTimeout(15000)
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        await page.goto(origin + '/login')
        await page.getByLabel('Email', { exact: true }).fill(fixture.email)
        await page.getByLabel('Password', { exact: true }).fill(fixture.password)
        const meReply = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/me' && response.ok())
        await page.getByRole('button', { name: 'Sign in', exact: true }).click()
        const me = await (await meReply).json()
        await page.evaluate(({ id, shopId }) => localStorage.setItem(`storely.shop.${id}`, shopId), { id: me.id, shopId: shop.id })
        const reportReply = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/shops/${shop.id}/reports/stock-valuation` && response.ok())
        await page.goto(origin + '/reports/stock')
        const actual = await (await reportReply).json()
        assert.equal(actual.gst_registered, expected.gst_registered)
        assert.equal(actual.total_cost, expected.total_cost)
        assert.equal(actual.total_sale, expected.total_sale)
        assert.deepEqual(actual.items.map(item => item.name), contract.expected_order.map(id => contract.products.find(item => item.id === id).name))
        const table = page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'At cost', exact: true }) })
        await table.waitFor()
        const note = await page.locator('.report-note').textContent()
        assert.ok(note.includes(expected.gst_registered ? 'GST you pay on purchases is claimed back' : 'Purchase GST is included in stock cost when it cannot be recovered'))
        assert.ok(!note.includes('Your shop is not GST-registered'))
        assert.equal(await table.locator('tbody tr').count(), contract.expected_order.length)
        for (const id of contract.expected_order) {
          const product = contract.products.find(item => item.id === id)
          const values = expected.items[id]
          const apiRow = actual.items.find(item => item.name === product.name)
          for (const field of ['cost_value', 'sale_value', 'unit_cost']) assert.equal(apiRow[field], values[field], `${shop.case_id}/${id}/${field}`)
          const row = table.locator('tbody tr').filter({ has: page.getByRole('link', { name: product.name, exact: true }) })
          const cells = await row.locator('td').allTextContents()
          assert.equal(cells[2].trim(), qty(product.quantity))
          assert.equal(cells[4], money(values.unit_cost))
          assert.equal(cells[5], money(values.cost_value))
          assert.equal(cells[6], money(values.sale_value))
        }
        const totals = await table.locator('tfoot th').allTextContents()
        assert.deepEqual(totals, ['Total', money(expected.total_cost), money(expected.total_sale)])
        for (const id of contract.excluded) assert.equal(await table.getByRole('link', { name: contract.products.find(item => item.id === id).name, exact: true }).count(), 0)
        const downloadPromise = page.waitForEvent('download')
        await page.getByRole('button', { name: 'Download CSV', exact: true }).click()
        const download = await downloadPromise
        assert.ok(download.suggestedFilename().startsWith('stock-valuation_'))
        const exported = csvRows(await fs.readFile(await download.path(), 'utf8'))
        const total = exported.find(row => row[0] === 'Total')
        assert.equal(Number(total[4]), Number(expected.total_cost))
        assert.equal(Number(total[5]), Number(expected.total_sale))
        for (const id of contract.expected_order) {
          const product = contract.products.find(item => item.id === id)
          const row = exported.find(row => row[0] === product.name)
          assert.ok(row, `Missing export row ${id}`)
          assert.equal(Number(row[3]), Number(product.quantity))
          assert.equal(Number(row[4]), Number(expected.items[id].cost_value))
          assert.equal(Number(row[5]), Number(expected.items[id].sale_value))
        }
        assert.deepEqual(errors, [])
        results.push({ case_id: shop.case_id, total_cost: actual.total_cost, total_sale: actual.total_sale, rows: actual.items.length, browser: 'passed', csv: 'passed' })
        process.stdout.write(`PASS ${shop.case_id}: signed quantities, exact API/UI row values, totals and CSV\n`)
      } finally { await context.close() }
    }
    const evidence = { fixture_sha256: crypto.createHash('sha256').update(fixtureBytes).digest('hex'), run: fixture.run, origin, results }
    if (process.env.STORELY_VALUATION_EVIDENCE) await fs.writeFile(process.env.STORELY_VALUATION_EVIDENCE, JSON.stringify(evidence, null, 2) + '\n')
  } finally { await browser.close() }
})().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1 })
