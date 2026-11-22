// Disposable A(owner, two shops)/B(staff, first shop) fixture; coordinator owns cleanup.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs')
const { randomUUID } = require('node:crypto')
const assert = require('node:assert/strict')
const origin = process.env.STORELY_WEB_ORIGIN || 'http://127.0.0.1:5173'
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Localhost origin required')
if (!process.env.STORELY_FIXTURE) throw new Error('Run-owned fixture required')
const fixture = JSON.parse(fs.readFileSync(process.env.STORELY_FIXTURE, 'utf8'))
;(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('dialog', dialog => dialog.accept())
  try {
    const [one, two] = fixture.shops
    const auth = await context.request.post(origin + '/v1/auth/login', { data: { email: fixture.a.email, password: fixture.a.password, client: 'mobile' }, headers: { 'X-Requested-With': 'storely-web' } })
    assert.ok(auth.ok())
    const headers = { authorization: `Bearer ${(await auth.json()).access_token}` }
    async function api(method, shop, path, body, key) {
      const response = await context.request.fetch(`${origin}/v1/shops/${shop}${path}`, { method, headers: { ...headers, ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body === undefined ? {} : { data: body }) })
      if (!response.ok()) {
        const error = await response.json().catch(() => ({}))
        throw new Error(`${method} fixture ${path} (${response.status()}): ${error.error?.code || 'HTTP error'} ${JSON.stringify(error.error?.fields || [])}`)
      }
      return response.json()
    }
    const seedPath = process.env.STORELY_SEARCH_SEED || process.env.STORELY_FIXTURE + '.workspace-search-seed.json'
    let seed
    try {
      const prior = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
      if (prior.shop1 === one.id && prior.shop2 === two.id) seed = prior
    } catch { /* A new fixture is seeded once; completed seeds are reusable for UI-only retries. */ }
    if (!seed) {
    for (const shop of [one.id, two.id]) assert.equal((await api('GET', shop, '/products?limit=1')).total, 0, 'Fresh disposable catalog required')
    const tag = randomUUID().slice(0, 8)
    const category = await api('POST', one.id, '/categories', { name: `Family grains ${tag}` })
    const supplier = await api('POST', one.id, '/suppliers', { name: `Farm source ${tag}` })
    const shared = `Needle-${tag}`
    const createProduct = async (shop, name, extra = {}) => (await api('POST', shop, '/products', { name, price_mode: 'fixed', selling_price: '118', purchase_price: '70', track_stock: true, opening_quantity: '10', ...extra }, `search-product-${randomUUID()}`)).product
    const product = await createProduct(one.id, `Search rice ${tag}`, { barcode: shared, category_uuid: category.uuid, supplier_uuid: supplier.uuid })
    const other = await createProduct(two.id, `Other shop rice ${tag}`, { barcode: shared })
    const literal = await createProduct(one.id, `Literal %_\\ ${tag}`, { barcode: `Literal-${tag}` })
    const customer = (await api('POST', one.id, '/customers', { name: `Ravi ${tag}`, phone: '9876543210', address: `Quiet Lane ${tag}`, gstin: '27ABCDE1234F1Z5' }, `search-customer-${randomUUID()}`)).customer
    assert.ok(customer.uuid, 'Customer identity')
    async function createBill(amount) {
      const cart = { bill_type: 'b2c', discount_percent: '0', customer_name: customer.name, customer_phone: customer.phone, items: [{ product_uuid: product.uuid, quantity: '1' }] }
      const preview = await api('POST', one.id, '/bills/preview', cart)
      return api('POST', one.id, '/bills', { ...cart, reviewed_context: preview.reviewed_context, settlement_choice: amount === '0' ? 'unpaid' : 'partial', allow_unassigned_credit: false, payment: { amount, method: 'cash', reference: null } }, `search-bill-${randomUUID()}`)
    }
    const sale = await createBill('50')
    const voided = await createBill('0')
    await api('POST', one.id, `/bills/${voided.bill.uuid}/cancel`, { reason: 'Isolated search acceptance' })
    const creditBody = { quantities: { [sale.items[0].uuid]: '0.1' }, settlement: 'adjust', refund_method: 'cash', reason: 'Isolated search credit note' }
    await api('POST', one.id, `/bills/${sale.bill.uuid}/credit-note/preview`, { quantities: creditBody.quantities, settlement: creditBody.settlement })
    const credit = await api('POST', one.id, `/bills/${sale.bill.uuid}/credit-note`, creditBody, `search-credit-${randomUUID()}`)
    assert.equal(credit.bill.document_type, 'credit_note')
      seed = { shop1: one.id, shop2: two.id, category, supplier, shared, product, other, literal, customer, sale, voided, credit }
      fs.writeFileSync(seedPath, JSON.stringify(seed), { mode: 0o600 })
    }
    const { category, supplier, shared, product, other, literal, customer, sale, voided, credit } = seed
    await page.goto(origin + '/login')
    async function login(account) {
      await page.getByLabel('Email', { exact: true }).fill(account.email)
      await page.getByLabel('Password', { exact: true }).fill(account.password)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await page.getByLabel('Search workspace', { exact: true }).waitFor()
    }
    await login(fixture.a)
    await page.getByRole('combobox', { name: 'Shop', exact: true }).selectOption(one.id)
    const input = page.getByLabel('Search workspace', { exact: true })
    const results = page.getByRole('region', { name: 'Workspace search results', exact: true })
    const link = (kind, id) => results.locator(`a[href="/${kind}/${id}"]`)
    const entities = ['/products', '/bills', '/customers/accounts']
    async function search(q, shop = one.id) {
      const responses = entities.map(entity => page.waitForResponse(response => {
        const url = new URL(response.url())
        return response.request().method() === 'GET' && url.pathname === `/v1/shops/${shop}${entity}` && url.searchParams.get('q') === q && url.searchParams.get('workspace_search') === 'true'
      }))
      if (await input.inputValue()) await input.fill('')
      await input.fill(q)
      const loaded = await Promise.all(responses)
      for (const response of loaded) assert.equal(new URL(response.url()).searchParams.get('limit'), '5')
      await page.waitForFunction(() => { const results = document.querySelector('[aria-label="Workspace search results"]'); return results && !results.querySelector('.loading') })
      return loaded
    }
    await search(category.name)
    assert.equal(await link('products', product.uuid).count(), 1, 'Category search returns exact product')
    await link('products', product.uuid).click()
    await page.waitForURL(url => url.pathname === '/products/' + product.uuid)
    await page.goBack()
    await page.waitForURL(origin + '/')
    await search(supplier.name)
    assert.equal(await link('products', product.uuid).count(), 1, 'Supplier search')
    await search('%_\\')
    assert.equal(await link('products', literal.uuid).count(), 1, 'Wildcard characters are literal')
    assert.equal(await link('products', product.uuid).count(), 0)
    await search(customer.address)
    assert.equal(await link('customers', customer.uuid).count(), 1, 'Customer address search')
    await link('customers', customer.uuid).click()
    await page.waitForURL(url => url.pathname === '/customers/' + customer.uuid)
    await page.goBack()
    await search(customer.gstin)
    assert.equal(await link('customers', customer.uuid).count(), 1, 'Customer GSTIN search')
    await search('+91 (98765) 43210')
    assert.equal(await link('customers', customer.uuid).count(), 1, 'Server normalizes phone-shaped query')
    assert.equal(await link('billing', sale.bill.uuid).count(), 1)
    assert.equal(await link('billing', credit.bill.uuid).count(), 1)
    assert.match(await link('billing', credit.bill.uuid).innerText(), /Credit note/)
    assert.equal(await link('billing', voided.bill.uuid).count(), 0)
    await link('billing', sale.bill.uuid).click()
    await page.waitForURL(url => url.pathname === '/billing/' + sale.bill.uuid)
    await page.goBack()
    await search(voided.bill.bill_number)
    assert.equal(await link('billing', voided.bill.uuid).count(), 0, 'Voided invoice excluded')
    let failProducts = true
    await page.route('**/products?*', async route => {
      const url = new URL(route.request().url())
      if (url.searchParams.get('workspace_search') === 'true' && failProducts) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unavailable', message: 'Injected partial outage' } }) })
      return route.continue()
    })
    await search(customer.name)
    await page.getByRole('button', { name: 'Retry products search', exact: true }).waitFor()
    assert.equal(await link('customers', customer.uuid).count(), 1, 'Customer results survive product failure')
    assert.equal(await link('billing', sale.bill.uuid).count(), 1)
    failProducts = false
    const retried = page.waitForResponse(response => { const url = new URL(response.url()); return url.pathname === `/v1/shops/${one.id}/products` && url.searchParams.get('workspace_search') === 'true' })
    await page.getByRole('button', { name: 'Retry products search', exact: true }).click()
    assert.ok((await retried).ok())
    await page.getByRole('button', { name: 'Retry products search', exact: true }).waitFor({ state: 'hidden' })
    let enter
    let release
    const entered = new Promise(resolve => { enter = resolve })
    const gate = new Promise(resolve => { release = resolve })
    await page.route(`**/v1/shops/${one.id}/products?*`, async route => {
      const url = new URL(route.request().url())
      if (url.searchParams.get('workspace_search') !== 'true' || url.searchParams.get('q') !== shared) return route.fallback()
      enter(); await gate
      try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [product], total: 1, next_cursor: null }) }) } catch { /* The scoped request is expected to have been aborted. */ }
    })
    await input.fill(shared)
    await entered
    await page.getByRole('combobox', { name: 'Shop', exact: true }).selectOption(two.id)
    await input.waitFor()
    assert.equal(await input.inputValue(), '', 'Shop switch clears query')
    release()
    await page.unroute(`**/v1/shops/${one.id}/products?*`)
    await search(shared, two.id)
    assert.equal(await link('products', other.uuid).count(), 1)
    assert.equal(await link('products', product.uuid).count(), 0, 'Late old-shop result is not shown')
    await page.getByRole('combobox', { name: 'Shop', exact: true }).selectOption(one.id)
    await input.waitFor()
    assert.equal(await input.inputValue(), '')
    await page.locator('.account-toggle').click()
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await page.getByLabel('Email', { exact: true }).waitFor()
    const staffReports = []
    page.on('request', request => { if (new URL(request.url()).pathname.includes('/reports/')) staffReports.push(request.url()) })
    await login(fixture.b)
    assert.equal(await input.inputValue(), '', 'Account switch clears query')
    const staff = await search(category.name)
    const productResponse = staff.find(response => new URL(response.url()).pathname.endsWith('/products'))
    const staffProducts = (await productResponse.json()).items
    assert.equal('purchase_price' in staffProducts[0], false, 'Staff response does not expose private cost')
    assert.equal(await link('products', product.uuid).count(), 1)
    assert.equal(await page.getByRole('combobox', { name: 'Shop', exact: true }).count(), 0)
    assert.equal(staffReports.length, 0, 'Home staff search issues no restricted report requests')
    if (process.env.STORELY_ARTIFACT_DIR) {
      fs.mkdirSync(process.env.STORELY_ARTIFACT_DIR, { recursive: true })
      await page.screenshot({ path: `${process.env.STORELY_ARTIFACT_DIR}/workspace-search.png`, fullPage: true })
    }
    process.stdout.write('PASS category/supplier/literal/GSTIN/address/phone search, exact record routes, active credit-note labels, void exclusion, partial retry, delayed tenant isolation and staff/account scope\n')
  } finally { await browser.close() }
})().catch(error => { process.stderr.write((error.stack || String(error)) + '\n'); process.exitCode = 1 })
