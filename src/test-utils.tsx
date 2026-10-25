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
  const calls: { method: string; path: string; body: unknown }[] = []
  vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
    const method = init.method ?? 'GET'
    calls.push({ method, path, body: init.body ? JSON.parse(init.body as string) : undefined })
    const route = routes.find((r) => r.method === method && (typeof r.path === 'string' ? r.path === path : r.path.test(path)))
    if (!route) return new Response(JSON.stringify({ error: { code: 'unexpected', message: `no fake for ${method} ${path}` } }), { status: 599 })
    const status = route.status ?? 200
    return new Response(status === 204 ? null : JSON.stringify(route.body ?? {}), { status })
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

export const SIGNED_IN: Route[] = [
  ok('POST', '/v1/auth/refresh', { access_token: 't', expires_in: 900 }),
  ok('GET', '/v1/me', { id: 'u1', email: 'a@b.c', full_name: 'Asha', email_verified: true }),
]
