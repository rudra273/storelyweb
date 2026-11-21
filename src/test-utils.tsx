import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import App from './App'
import { clearAccessToken, setSessionLostHandler } from './api/client'

export interface Route {
  method: string
  path: string | RegExp
  status?: number
  body?: unknown
}

/** A fake API: answers by method + path, records every call, fails on anything unexpected. */
export function fakeApi(routes: Route[]) {
  const calls: { method: string; path: string; body: unknown; headers: Headers }[] = []
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    const method = init.method ?? 'GET'
    calls.push({ method, path, body: init.body ? JSON.parse(init.body as string) : undefined, headers: new Headers(init.headers) })
    const route = routes.find((r) => r.method === method && (typeof r.path === 'string' ? r.path === path : r.path.test(path)))
    if (!route) return new Response(JSON.stringify({ error: { code: 'unexpected', message: `no fake for ${method} ${path}` } }), { status: 599 })
    const status = route.status ?? 200
    return new Response(status === 204 ? null : JSON.stringify(typeof route.body === 'function' ? (route.body as (path: string) => unknown)(path) : route.body ?? {}), { status })
  })
  return calls
}

export function renderApp(path = '/') {
  clearAccessToken()
  setSessionLostHandler(null)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

export const ok = (method: string, path: string | RegExp, body?: unknown, status = 200): Route => ({ method, path, body, status })

export const ACCOUNT_SESSION: Route[] = [
  ok('POST', '/v1/auth/refresh', { access_token: 't', expires_in: 900 }),
  ok('GET', '/v1/me', { id: 'u1', email: 'a@b.c', full_name: 'Asha', email_verified: true }),
]


export const ACTIVE_ENTITLEMENT = {
  shop_id: 's1', plan: 'premium', status: 'active', effective_status: 'active',
  starts_at: '2020-01-01T00:00:00Z', ends_at: '2099-01-01T00:00:00Z',
  revision: 1, updated_at: '2026-01-01T00:00:00Z',
  server_time: '2026-01-01T00:00:00Z', cloud_sync: true, web_access: true,
}
export const PAID_SHOP: Route[] = [
  ok('GET', /^\/v1\/shops\/[^/]+\/entitlement$/, (path: string) => ({ ...ACTIVE_ENTITLEMENT, shop_id: path.split('/')[3] })),
]

export const SIGNED_IN: Route[] = [...ACCOUNT_SESSION, ...PAID_SHOP, ok('GET', /^\/v1\/shops\/[^/]+\/capabilities$/, (path: string) => ({ contract_version: 1, shop_id: path.split('/')[3], role: 'owner', features: { operation_lookup: 1, supplier_payment_proof: 1, supplier_payment_binding: 2, product_expected_updated_at: 1, settings_revision: 1 } }))]
