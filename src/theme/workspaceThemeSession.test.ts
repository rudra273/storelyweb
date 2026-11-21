import { waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { fakeApi, ok } from '../test-utils'
import { createWorkspaceTheme, workspaceThemeKey } from './workspaceThemeSession'

const sessions: ReturnType<typeof createWorkspaceTheme>[] = []
const open = (user = 'u1', shop = 's1', enabled = true, options = {}) => {
  const session = createWorkspaceTheme(user, shop, enabled, () => {}, options)
  sessions.push(session)
  return session
}
const path = '/v1/shops/s1/preferences/theme'
const json = (theme: string, status = 200) => new Response(JSON.stringify({ theme }), { status })
afterEach(() => { sessions.forEach(session => session.dispose()); sessions.length = 0; vi.unstubAllGlobals() })

test('guest choice is never imported; cloud System is explicitly written and confirmed per account/shop', async () => {
  localStorage.setItem('storely.theme', 'dark')
  const calls = fakeApi([ok('GET', path, { theme: 'system' }), ok('PUT', path, (_path: string, body: unknown) => body)])
  const session = open()
  expect(session.state.preference).toBe('system')
  await session.load()
  session.choose('light')
  await waitFor(() => expect(session.state.pending).toBeNull())
  expect(localStorage.getItem(workspaceThemeKey('u1', 's1'))).toBe('light')
  session.choose('system')
  await waitFor(() => expect(session.state.pending).toBeNull())
  expect(calls.filter(call => call.method === 'PUT').map(call => call.body)).toEqual([{ theme: 'light' }, { theme: 'system' }])
  expect(localStorage.getItem(workspaceThemeKey('u1', 's1'))).toBe('system')
  expect(localStorage.getItem('storely.theme')).toBe('dark')
  expect(open('u2', 's1').state.preference).toBe('system')
  expect(open('u1', 's2').state.preference).toBe('system')
})

for (const status of [200, 503]) {
  test(`late GET ${status} cannot overwrite a newer confirmed local choice`, async () => {
    let resolve!: (response: Response) => void
    vi.stubGlobal('fetch', (_path: string, options: RequestInit) => options.method === 'GET' ? new Promise<Response>(done => { resolve = done }) : Promise.resolve(json(JSON.parse(options.body as string).theme)))
    const session = open()
    const loaded = session.load()
    session.choose('dark')
    await waitFor(() => expect(session.state.pending).toBeNull())
    resolve(json('light', status))
    await loaded
    expect(session.state).toEqual({ preference: 'dark', pending: null, error: null })
    expect(localStorage.getItem(session.key)).toBe('dark')
  })
}

test('rapid writes are serialized and coalesce to the last explicit System choice', async () => {
  const writes: string[] = []
  let resolve!: (response: Response) => void
  vi.stubGlobal('fetch', (_path: string, options: RequestInit) => {
    const theme = JSON.parse(options.body as string).theme
    writes.push(theme)
    return writes.length === 1 ? new Promise<Response>(done => { resolve = done }) : Promise.resolve(json(theme))
  })
  const session = open()
  session.choose('dark')
  await waitFor(() => expect(writes).toEqual(['dark']))
  session.choose('light'); session.choose('system')
  expect(writes).toEqual(['dark'])
  resolve(json('dark'))
  await waitFor(() => expect(session.state.pending).toBeNull())
  expect(writes).toEqual(['dark', 'system'])
  expect(session.state.preference).toBe('system')
})

test('leaving a scope drops its queued writes and ignores its late acknowledgement', async () => {
  const writes: string[] = []
  let resolve!: (response: Response) => void
  vi.stubGlobal('fetch', (_path: string, options: RequestInit) => {
    const theme = JSON.parse(options.body as string).theme
    writes.push(theme)
    return writes.length === 1 ? new Promise<Response>(done => { resolve = done }) : Promise.resolve(json(theme))
  })
  const first = open()
  first.choose('dark')
  await waitFor(() => expect(writes).toHaveLength(1))
  first.choose('light'); first.dispose()
  const second = open('u2', 's1')
  expect(second.state.preference).toBe('system')
  second.choose('system')
  await waitFor(() => expect(second.state.pending).toBeNull())
  resolve(json('dark'))
  await new Promise(done => setTimeout(done, 0))
  expect(writes).toEqual(['dark', 'system'])
  expect(localStorage.getItem(first.key)).toBeNull()
  expect(localStorage.getItem(second.key)).toBe('system')
})

test('failed writes keep the local choice, preserve confirmed cache and retry without a durable queue', async () => {
  localStorage.setItem(workspaceThemeKey('u1', 's1'), 'dark')
  let unavailable = true
  const calls: string[] = []
  vi.stubGlobal('fetch', (_path: string, options: RequestInit) => {
    const theme = JSON.parse(options.body as string).theme
    calls.push(theme)
    return Promise.resolve(json(theme, unavailable ? 503 : 200))
  })
  const session = open()
  session.choose('light')
  await waitFor(() => expect(session.state.error).toContain('could not be saved'))
  expect(session.state.preference).toBe('light')
  expect(localStorage.getItem(session.key)).toBe('dark')
  await session.load()
  expect(calls).toEqual(['light']) // Refresh cannot overwrite unsaved local intent.
  unavailable = false; session.retry()
  await waitFor(() => expect(session.state.error).toBeNull())
  expect(calls).toEqual(['light', 'light'])
  expect(localStorage.getItem(session.key)).toBe('light')
})

test('failed or malformed reads use only the current scope cache and expose retry', async () => {
  localStorage.setItem(workspaceThemeKey('u1', 's1'), 'dark')
  localStorage.setItem(workspaceThemeKey('u2', 's1'), 'purple')
  fakeApi([ok('GET', path, { theme: 'purple' })])
  const first = open(); const second = open('u2')
  await Promise.all([first.load(), second.load()])
  expect(first.state.preference).toBe('dark')
  expect(second.state.preference).toBe('system')
  expect(first.state.error).toContain('could not be loaded')
  fakeApi([ok('GET', path, { theme: 'light' })])
  first.retry()
  await waitFor(() => expect(first.state.error).toBeNull())
  expect(first.state.preference).toBe('light')
})

test('a contradictory PUT response is not treated as a saved local choice', async () => {
  fakeApi([ok('PUT', path, { theme: 'light' })])
  const session = open()
  session.choose('dark')
  await waitFor(() => expect(session.state.error).toContain('could not be saved'))
  expect(session.state.preference).toBe('dark')
  expect(localStorage.getItem(session.key)).toBeNull()
})

test('unpaid choice is scoped and session-local while pending access cannot change or send it', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  localStorage.setItem('storely.theme', 'light')
  const local = open('u1', 's1', false)
  await local.load(); local.choose('dark')
  expect(local.state.preference).toBe('dark')
  expect(localStorage.getItem(local.key)).toBeNull()
  expect(localStorage.getItem('storely.theme')).toBe('light')
  const pending = open('u1', 's2', false, { pending: true })
  await pending.load(); pending.choose('dark')
  expect(pending.state.preference).toBe('system')
  expect(pending.disabled).toBe(true)
  expect(fetch).not.toHaveBeenCalled()
})
