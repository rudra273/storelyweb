import type { LoginResult } from './types'

/**
 * The only module that talks to the API. Two rules live here:
 *  - the short-lived access token stays in memory (never localStorage/sessionStorage,
 *    so a script injected into the page cannot read it back later);
 *  - the long-lived refresh token is an httpOnly cookie the browser handles by itself.
 */

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly retryAfter: number | null
  readonly fields: { field: string; message: string }[]

  constructor(
    status: number,
    code: string,
    message: string,
    retryAfter: number | null = null,
    fields: { field: string; message: string }[] = [],
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
    this.fields = fields
  }
}

// Sent on every request. A page on another site cannot add a custom header without
// our permission, which is what protects the cookie-based refresh from CSRF.
const WEB_HEADER = { 'X-Requested-With': 'storely-web' }

let accessToken: string | null = null
let onSessionLost: (() => void) | null = null
let refreshing: Promise<boolean> | null = null

export function setSessionLostHandler(handler: (() => void) | null): void {
  onSessionLost = handler
}

export function hasAccessToken(): boolean {
  return accessToken !== null
}

export function clearAccessToken(): void {
  accessToken = null
}

export function setAccessToken(token: string): void {
  accessToken = token
}

export function storeLogin(result: LoginResult): boolean {
  if (result.access_token) {
    accessToken = result.access_token
    return true
  }
  return false
}

async function parseError(response: Response): Promise<ApiError> {
  let code = `http_${response.status}`
  let message = 'Something went wrong. Please try again.'
  let fields: { field: string; message: string }[] = []
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string; fields?: typeof fields }
    }
    code = body.error?.code ?? code
    message = body.error?.message ?? message
    fields = body.error?.fields ?? []
  } catch {
    // not JSON (a proxy error page, say): keep the generic message
  }
  const retry = Number(response.headers.get('Retry-After'))
  return new ApiError(response.status, code, message, Number.isFinite(retry) && retry > 0 ? retry : null, fields)
}

async function send(method: string, path: string, body: unknown, withToken: boolean, idempotencyKey?: string): Promise<Response> {
  const headers: Record<string, string> = { ...WEB_HEADER }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  const raw = body instanceof Blob // a file goes up as it is, everything else as JSON
  if (body !== undefined) headers['Content-Type'] = raw ? 'application/octet-stream' : 'application/json'
  if (withToken && accessToken) headers.Authorization = `Bearer ${accessToken}`
  try {
    return await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
    })
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the server. Check your connection and try again.')
  }
}

/**
 * Trades the refresh cookie for a new access token. Calls made at the same moment share
 * one request, because every refresh rotates the cookie and a second one would race it.
 * Returns false only when the server says the session is over; a dropped connection
 * throws instead, so a bad network never signs anyone out.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null
  })
  return refreshing
}

async function doRefresh(): Promise<boolean> {
  const response = await send('POST', '/v1/auth/refresh', {}, false)
  if (response.ok) {
    accessToken = ((await response.json()) as { access_token: string }).access_token
    return true
  }
  if (response.status === 401 || response.status === 403 || response.status === 400) {
    accessToken = null
    return false
  }
  throw await parseError(response)
}

export async function request<T>(
  method: string,
  path: string,
  options: { body?: unknown; auth?: boolean; as?: 'json' | 'blob'; idempotencyKey?: string } = {},
): Promise<T> {
  const withToken = options.auth !== false
  let response = await send(method, path, options.body, withToken, options.idempotencyKey)
  if (response.status === 401 && withToken) {
    // The access token expired (or was revoked): try the cookie once, then repeat.
    if (await refreshSession()) {
      response = await send(method, path, options.body, true, options.idempotencyKey)
    } else {
      onSessionLost?.()
    }
  }
  if (!response.ok) throw await parseError(response)
  if (response.status === 204) return undefined as T
  if (options.as === 'blob') return (await response.blob()) as T
  return (await response.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown, auth = true) => request<T>('POST', path, { body: body ?? {}, auth }),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, { body }),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, { body }),
}
