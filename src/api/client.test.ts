import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ApiError, api, clearAccessToken, refreshSession, setSessionLostHandler, storeLogin } from './client'

type Call = { url: string; init: RequestInit }
let calls: Call[]

function reply(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers })
}

function mockFetch(handler: (call: Call) => Response | Promise<Response>) {
  calls = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const call = { url, init }
    calls.push(call)
    return handler(call)
  })
}

function call(i: number): Call {
  const found = calls[i]
  if (!found) throw new Error(`no request number ${i}`)
  return found
}

const header = (call: Call, name: string) => (call.init.headers as Record<string, string>)[name]

beforeEach(() => {
  clearAccessToken()
  setSessionLostHandler(null)
})
afterEach(() => vi.unstubAllGlobals())

test('every request carries the anti-CSRF header and never stores the token in the browser', async () => {
  mockFetch(() => reply(200, { ok: true }))
  storeLogin({ access_token: 'tok-1', token_type: 'bearer', expires_in: 900, mfa_required: false })
  await api.get('/v1/me')
  expect(header(call(0), 'X-Requested-With')).toBe('storely-web')
  expect(header(call(0), 'Authorization')).toBe('Bearer tok-1')
  expect(call(0).init.credentials).toBe('same-origin')
  expect(localStorage.length).toBe(0)
  expect(sessionStorage.length).toBe(0)
})

test('an expired token is refreshed through the cookie and the request is repeated once', async () => {
  let me = 0
  mockFetch((call) => {
    if (call.url === '/v1/auth/refresh') return reply(200, { access_token: 'tok-2', expires_in: 900 })
    me += 1
    return me === 1 ? reply(401, { error: { code: 'invalid_token', message: 'x' } }) : reply(200, { id: 'u' })
  })
  storeLogin({ access_token: 'tok-1', token_type: 'bearer', expires_in: 900, mfa_required: false })
  expect(await api.get('/v1/me')).toEqual({ id: 'u' })
  expect(calls.map((c) => c.url)).toEqual(['/v1/me', '/v1/auth/refresh', '/v1/me'])
  expect(header(call(2), 'Authorization')).toBe('Bearer tok-2')
  expect(header(call(1), 'Authorization')).toBeUndefined() // the refresh itself sends no token
})

test('simultaneous refreshes share one request', async () => {
  mockFetch(async () => reply(200, { access_token: 'tok-3', expires_in: 900 }))
  const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()])
  expect(results).toEqual([true, true, true])
  expect(calls).toHaveLength(1)
})

test('a refused refresh ends the session once and reports it', async () => {
  const lost = vi.fn()
  setSessionLostHandler(lost)
  mockFetch((call) =>
    call.url === '/v1/auth/refresh' ? reply(401, { error: { code: 'invalid_token', message: 'x' } }) : reply(401, { error: { code: 'invalid_token', message: 'x' } }),
  )
  storeLogin({ access_token: 'tok-1', token_type: 'bearer', expires_in: 900, mfa_required: false })
  await expect(api.get('/v1/me')).rejects.toBeInstanceOf(ApiError)
  expect(lost).toHaveBeenCalledTimes(1)
})

test('a network failure during refresh does not sign anyone out', async () => {
  const lost = vi.fn()
  setSessionLostHandler(lost)
  mockFetch((call) => {
    if (call.url === '/v1/auth/refresh') throw new TypeError('offline')
    return reply(401, { error: { code: 'invalid_token', message: 'x' } })
  })
  storeLogin({ access_token: 'tok-1', token_type: 'bearer', expires_in: 900, mfa_required: false })
  await expect(api.get('/v1/me')).rejects.toMatchObject({ code: 'network' })
  expect(lost).not.toHaveBeenCalled()
})

test('server errors keep their code, message and Retry-After; nothing else leaks', async () => {
  mockFetch(() => reply(429, { error: { code: 'rate_limited', message: 'Slow down.' } }, { 'Retry-After': '30' }))
  await expect(api.post('/v1/auth/login', {}, false)).rejects.toMatchObject({
    status: 429,
    code: 'rate_limited',
    message: 'Slow down.',
    retryAfter: 30,
  })
})

test('a non-JSON error page becomes a generic message', async () => {
  mockFetch(() => new Response('<html>502 Bad Gateway nginx/1.2</html>', { status: 502 }))
  const error = await api.get('/v1/me').catch((e: ApiError) => e)
  expect(error).toBeInstanceOf(ApiError)
  expect((error as ApiError).message).not.toContain('nginx')
})

test('redirects are refused so a token can never follow one to another host', async () => {
  mockFetch(() => reply(200, {}))
  await api.get('/v1/me')
  expect(call(0).init.redirect).toBe('error')
})

test('bill retries keep the same idempotency key when an expired token is refreshed', async () => {
  let writes = 0
  mockFetch(c => {
    if (c.url === '/v1/auth/refresh') return reply(200, { access_token: 'new' })
    return ++writes === 1 ? reply(401) : reply(201, { bill: 'b1' })
  })
  const { request } = await import('./client')
  await request('POST', '/v1/shops/s1/bills', { body: { items: [] }, idempotencyKey: 'stable-bill-key' })
  expect(header(call(0), 'Idempotency-Key')).toBe('stable-bill-key')
  expect(header(call(2), 'Idempotency-Key')).toBe('stable-bill-key')
  expect(call(0).init.body).toBe(call(2).init.body)
})

test('server error responses expose X-Request-ID and error.request_id on ApiError', async () => {
  mockFetch(() =>
    reply(
      500,
      { error: { code: 'internal_error', message: 'Something went wrong.', request_id: 'req-body-1' } },
      { 'X-Request-ID': 'req-hdr-1' },
    ),
  )
  const err = await api.get('/v1/me').catch((e: ApiError) => e)
  expect(err).toBeInstanceOf(ApiError)
  expect((err as ApiError).requestId).toBe('req-body-1')

  mockFetch(() => new Response('<html>Bad Gateway</html>', { status: 502, headers: { 'X-Request-ID': 'req-hdr-2' } }))
  const proxyErr = await api.get('/v1/me').catch((e: ApiError) => e)
  expect((proxyErr as ApiError).requestId).toBe('req-hdr-2')
})

test('requests respect caller cancellation and timeout budgets', async () => {
  const ac = new AbortController()
  ac.abort()
  await expect(api.get('/v1/me', { signal: ac.signal })).rejects.toMatchObject({ name: 'AbortError' })

  const { request } = await import('./client')
  mockFetch(c => new Promise((_resolve, reject) => {
    c.init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  }))
  await expect(api.get('/v1/me', { timeoutMs: 10 })).rejects.toMatchObject({ status: 408, code: 'timeout' })
  await expect(request('POST', '/v1/shops/s1/bills', { body: {}, timeoutMs: 10 })).rejects.toMatchObject({
    status: 408,
    code: 'timeout',
    message: expect.stringContaining('Check whether it saved'),
  })
})
