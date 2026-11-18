// Bounded real-browser smoke for the current no-shop onboarding contract.
// Start the local API and current-checkout Vite first. This creates only one
// synthetic account, never requests paid access, and deletes that account.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const origin = process.env.STORELY_WEB_ORIGIN || 'http://localhost:5173'
const mail = process.env.STORELY_MAIL_ORIGIN || 'http://127.0.0.1:8025'
if (!['localhost', '127.0.0.1', 'app.storely.localhost'].includes(new URL(origin).hostname)) throw new Error('Local test origin required')
if (!['localhost', '127.0.0.1', 'host.docker.internal'].includes(new URL(mail).hostname)) throw new Error('Local mail origin required')
const email = `onboarding-${crypto.randomUUID()}@example.com`
const password = crypto.randomBytes(24).toString('base64url')

async function verificationCode() {
  for (let attempt = 0; attempt < 80; attempt++) {
    const found = await (await fetch(`${mail}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()
    for (const row of found.messages || []) {
      const message = await (await fetch(`${mail}/api/v1/message/${row.ID}`)).json()
      const code = /\b(\d{6})\b/.exec(message.Text)
      if (code) return { code: code[1], id: row.ID }
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Synthetic verification email did not arrive')
}

;(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  let token
  let mailId
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const call = async (method, path, data, accessToken) => {
    const response = await context.request.fetch(origin + path, {
      method, data, headers: { 'X-Requested-With': 'storely-web', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    })
    assert.ok(response.ok(), `${method} ${path} returned ${response.status()}`)
    return response.status() === 204 ? null : response.json()
  }
  try {
    await call('POST', '/v1/auth/signup', { email, password, full_name: 'Onboarding Review' })
    const verification = await verificationCode()
    mailId = verification.id
    await call('POST', '/v1/auth/verify-email', { email, code: verification.code })
    token = (await call('POST', '/v1/auth/login', { email, password, client: 'mobile' })).access_token
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    const errors = []
    const writes = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => {
      const path = new URL(request.url()).pathname
      if (request.method() !== 'GET' && /^\/v1\/(shops|premium-requests|me\/premium-requests)/.test(path)) writes.push(`${request.method()} ${path}`)
    })
    await page.goto(origin + '/products')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('heading', { name: 'Welcome to Storely', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Create shop', exact: true }).count(), 0)
    await page.getByRole('link', { name: 'Request Premium', exact: true }).waitFor()
    await page.getByText('No invitations waiting.', { exact: false }).waitFor()
    await page.reload()
    await page.getByRole('heading', { name: 'Welcome to Storely', exact: true }).waitFor()
    await page.getByRole('link', { name: 'Request Premium', exact: true }).click()
    await page.getByRole('heading', { name: 'Request Premium', exact: true }).waitFor()
    assert.deepEqual(await call('GET', '/v1/shops', undefined, token), [])
    assert.deepEqual(writes, [], 'Viewing onboarding must not create a shop or submit a premium request')
    assert.deepEqual(errors, [], 'Browser runtime errors')
    process.stdout.write('PASS no-shop login, reload, invitation empty state, Premium navigation and no implicit business writes\n')
  } finally {
    try {
      if (token) await call('DELETE', '/v1/me', { password }, token)
      if (mailId) {
        const response = await fetch(`${mail}/api/v1/messages`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ IDs: [mailId] }) })
        assert.ok(response.ok, 'Synthetic mail cleanup failed')
      }
    } finally { await browser.close() }
  }
})().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1 })
