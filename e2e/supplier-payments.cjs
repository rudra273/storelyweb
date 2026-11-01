// Local development stack only. Credentials are read from a mounted .dev-login;
// no credentials or tokens are written to logs or browser storage.
const { chromium } = require('playwright')
const fs = require('node:fs')
const origin = 'https://app.storely.localhost'
const login = Object.fromEntries(fs.readFileSync('/run/dev-login', 'utf8').trim().split('\n').map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
;(async () => {
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP app.storely.localhost host.docker.internal'] })
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  try {
    const auth = await context.request.post(origin + '/v1/auth/login', { data: { email: login.email, password: login.password, client: 'web' }, headers: { 'X-Requested-With': 'storely-web', origin } })
    if (!auth.ok()) throw new Error(`Local test login failed (${auth.status()})`)
    const token = (await auth.json()).access_token
    const headers = { authorization: `Bearer ${token}`, 'X-Requested-With': 'storely-web', origin }
    async function api(method, path, body) {
      const response = await context.request.fetch(origin + path, { method, headers, data: body })
      if (!response.ok()) throw new Error(`Test API ${method} ${path} failed (${response.status()}): ${await response.text()}`)
      return response.json()
    }
    const shops = await api('GET', '/v1/shops')
    const shop = shops[0].shop_id
    const base = `/v1/shops/${shop}`
    const name = 'Supplier payment E2E ' + Date.now()
    const supplier = await api('POST', base + '/suppliers', { name })
    const productResult = await api('POST', base + '/products', { name, selling_price: '60', purchase_price: '40', track_stock: true })
    const product = productResult.product
    await page.goto(origin + '/products')
    await page.getByRole('button', { name: 'Add purchase', exact: true }).click()
    const composer = page.getByRole('dialog', { name: 'Add purchase', exact: true })
    await composer.getByLabel('Supplier (optional)', { exact: true }).selectOption(supplier.uuid)
    await composer.getByLabel('Find product', { exact: true }).fill(name)
    await composer.getByRole('button', { name: `Add ${name}`, exact: true }).click()
    await composer.getByLabel('Quantity · item 1', { exact: true }).fill('2')
    await composer.getByText('Charges, tax and payment terms', { exact: true }).click()
    await composer.getByLabel('GST amount (₹)', { exact: true }).fill('20')
    await composer.getByLabel('Payment', { exact: true }).selectOption('partial')
    await composer.getByLabel('Paid now (₹)', { exact: true }).fill('20')
    const posted = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/purchase-receipts'))
    await composer.getByRole('button', { name: 'Save purchase', exact: true }).click()
    const receiptResponse = await posted
    if (!receiptResponse.ok()) throw new Error(`Purchase save failed: ${await receiptResponse.text()}`)
    const receipt = await receiptResponse.json()
    if (receipt.total !== '100.00' || receipt.balance_due !== '80.00') throw new Error('Purchase totals do not reconcile')
    await page.getByRole('dialog', { name: 'Purchase saved' }).getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByText('More actions').click()
    await page.getByRole('button', { name: 'Suppliers', exact: true }).click()
    const directory = page.getByRole('dialog', { name: 'Suppliers', exact: true })
    await directory.getByLabel('Search suppliers', { exact: true }).fill(name)
    await directory.getByText('Balance due: ₹80.00', { exact: true }).waitFor()
    await directory.getByRole('button', { name: 'Statement and payments', exact: true }).click()
    const statement = page.getByRole('dialog', { name, exact: true })
    await statement.getByLabel('Amount (₹)', { exact: true }).fill('80')
    const paymentPosted = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/payments'))
    await statement.getByRole('button', { name: 'Record payment', exact: true }).click()
    if (!(await paymentPosted).ok()) throw new Error('Payment failed')
    await statement.getByText('₹0.00', { exact: true }).first().waitFor()
    const final = await api('GET', base + '/purchase-receipts/' + receipt.uuid)
    if (final.payment_status !== 'paid' || final.balance_due !== '0.00' || final.payments.length !== 2) throw new Error('Paid receipt does not reconcile')
    const inventory = await api('GET', base + '/products/' + product.uuid)
    if (Number(inventory.product.quantity) !== 2) throw new Error('Payment changed stock')
    const changes = await api('GET', base + '/purchase-receipts/changes?after_sequence=' + receipt.change_sequence)
    if (!changes.some(r => r.uuid === receipt.uuid && r.payment_status === 'paid')) throw new Error('Phone feed missed payment')
    process.stdout.write('PASS: real browser purchase → part payment → supplier dues → final payment → receipt and stock reconciliation → phone change feed\n')
  } finally { await browser.close() }
})().catch(error => { process.stderr.write(error.message + "\n"); process.exitCode = 1 })
