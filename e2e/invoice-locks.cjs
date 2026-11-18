// Real Web Locks across two same-origin browser tabs, using only run-owned storage.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const origin = process.env.STORELY_WEB_ORIGIN || 'http://localhost:5173'
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Current-source localhost origin required')

;(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  const context = await browser.newContext()
  const first = await context.newPage()
  const second = await context.newPage()
  const run = crypto.randomUUID()
  const user = `lock-test-${run}`
  const shop = 'synthetic-shop'
  const key = `storely.draft.bill.${user}.${shop}`
  try {
    await Promise.all([first.goto(origin + '/login'), second.goto(origin + '/login')])
    for (const page of [first, second]) await page.evaluate(async ({ user, shop }) => {
      const { openInvoiceDraft } = await import('/src/billing/checkout/invoiceDraftStore.ts')
      window.lockTestStore = openInvoiceDraft(user, shop)
    }, { user, shop })
    // Hold the lock to place both pending writes behind the same exclusive owner.
    await first.evaluate(key => {
      void navigator.locks.request(key, async () => {
        window.lockTestHeld = true
        await new Promise(resolve => { window.lockTestRelease = resolve })
      })
    }, key)
    await first.waitForFunction(() => window.lockTestHeld === true)
    const write = (page, value) => page.evaluate(async value => {
      try { await window.lockTestStore.save({ attempt: { key: value, body: { amount: '12.50' } } }); return 'saved' }
      catch (error) { return error.kind }
    }, value)
    const writes = [write(first, 'operation-one'), write(second, 'operation-two')]
    await second.waitForFunction(async key => (await navigator.locks.query()).pending.filter(lock => lock.name === key).length === 2, key)
    assert.equal(await second.evaluate(key => localStorage.getItem(key), key), null)
    await first.evaluate(() => window.lockTestRelease())
    const results = await Promise.all(writes)
    assert.equal(results.filter(result => result === 'saved').length, 1)
    assert.equal(results.filter(result => result === 'conflict').length, 1)
    const persisted = await second.evaluate(key => JSON.parse(localStorage.getItem(key)), key)
    assert.ok(['operation-one', 'operation-two'].includes(persisted.data.attempt.key))

    // A closed owner releases its lock through the browser; no stale lease timer.
    const closedOwnerKey = key + '.closed-owner'
    await first.evaluate(key => {
      void navigator.locks.request(key, async () => {
        window.closedOwnerHeld = true
        await new Promise(() => {})
      })
    }, closedOwnerKey)
    await first.waitForFunction(() => window.closedOwnerHeld === true)
    const acquired = second.evaluate(key => navigator.locks.request(key, () => true), closedOwnerKey)
    await second.waitForFunction(async key => (await navigator.locks.query()).pending.some(lock => lock.name === key), closedOwnerKey)
    await first.close()
    assert.equal(await acquired, true)
    await second.evaluate(key => localStorage.removeItem(key), key)
    process.stdout.write('PASS real cross-tab exclusive persistence, one winning operation, and automatic release when owner tab closes\n')
  } finally { await browser.close() }
})().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1 })
