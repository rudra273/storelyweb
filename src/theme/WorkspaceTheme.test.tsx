import { useContext, useLayoutEffect } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { AppearanceControl } from './AppearanceControl'
import { ThemeProvider } from './ThemeProvider'
import { ThemeScopeContext } from './scope'
import { workspaceThemeKey } from './workspaceThemeSession'

afterEach(() => vi.unstubAllGlobals())
function Scope({ user = '', shop = '', enabled = true, pending = false }: { user?: string; shop?: string; enabled?: boolean; pending?: boolean }) {
  const bind = useContext(ThemeScopeContext)
  useLayoutEffect(() => { if (bind && user && shop) return bind(user, shop, enabled, pending) }, [bind, user, shop, enabled, pending])
  return null
}
const response = (theme: string, status = 200) => new Response(JSON.stringify({ theme }), { status })
const tree = (user: string, shop: string, enabled = true, pending = false) => <ThemeProvider><Scope user={user} shop={shop} enabled={enabled} pending={pending} /><input aria-label="Unfinished work" /><AppearanceControl /></ThemeProvider>

test('scope changes and guest restoration never show another account cache or remount unfinished work', async () => {
  localStorage.setItem('storely.theme', 'light')
  const reads: ((value: Response) => void)[] = []
  vi.stubGlobal('fetch', () => new Promise<Response>(resolve => { reads.push(resolve) }))
  const view = render(tree('a', 'one'))
  expect(screen.getByLabelText('Appearance')).toHaveValue('system')
  await act(async () => { reads[0]!(response('dark')) })
  await waitFor(() => expect(screen.getByLabelText('Appearance')).toHaveValue('dark'))
  const input = screen.getByLabelText('Unfinished work')
  await userEvent.type(input, 'keep these fields')
  view.rerender(tree('a', 'two'))
  expect(screen.getByLabelText('Appearance')).toHaveValue('system')
  expect(input).toHaveValue('keep these fields')
  await act(async () => { reads[1]!(response('light')) })
  view.rerender(tree('b', 'one'))
  expect(screen.getByLabelText('Appearance')).toHaveValue('system')
  expect(localStorage.getItem(workspaceThemeKey('a', 'one'))).toBe('dark')
  await act(async () => { reads[2]!(response('system')) })
  view.rerender(tree('', ''))
  expect(screen.getByLabelText('Appearance')).toHaveValue('light')
  expect(screen.getByLabelText('Unfinished work')).toBe(input)
  expect(input).toHaveValue('keep these fields')
  expect(localStorage.getItem('storely.theme')).toBe('light')
})

test('a failed cloud choice remains applied with a working explicit retry and preserves the form', async () => {
  localStorage.setItem('storely.theme', 'light')
  let writes = 0
  vi.stubGlobal('fetch', (_path: string, options: RequestInit) => options.method === 'GET' ? Promise.resolve(response('system')) : Promise.resolve(response(JSON.parse(options.body as string).theme, ++writes === 1 ? 503 : 200)))
  render(tree('a', 'one'))
  await waitFor(() => expect(screen.queryByText('Loading appearance…')).not.toBeInTheDocument())
  await userEvent.type(screen.getByLabelText('Unfinished work'), 'draft')
  await userEvent.selectOptions(screen.getByLabelText('Appearance'), 'dark')
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  expect(screen.getByLabelText('Unfinished work')).toHaveValue('draft')
  expect(localStorage.getItem(workspaceThemeKey('a', 'one'))).toBe('system')
  await userEvent.click(screen.getByRole('button', { name: 'Retry appearance' }))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(writes).toBe(2)
  expect(localStorage.getItem(workspaceThemeKey('a', 'one'))).toBe('dark')
  expect(localStorage.getItem('storely.theme')).toBe('light')
})

test('known unpaid appearance stays scoped for the session; pending entitlement cannot write', async () => {
  localStorage.setItem('storely.theme', 'light')
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  const view = render(tree('a', 'one', false))
  await userEvent.selectOptions(screen.getByLabelText('Appearance'), 'dark')
  view.rerender(tree('b', 'one', false))
  expect(screen.getByLabelText('Appearance')).toHaveValue('system')
  await userEvent.selectOptions(screen.getByLabelText('Appearance'), 'light')
  view.rerender(tree('a', 'one', false))
  expect(screen.getByLabelText('Appearance')).toHaveValue('dark')
  view.rerender(tree('a', 'two', false, true))
  expect(screen.getByLabelText('Appearance')).toBeDisabled()
  expect(fetch).not.toHaveBeenCalled()
  expect(localStorage.getItem('storely.theme')).toBe('light')
  expect(localStorage.getItem(workspaceThemeKey('a', 'one'))).toBeNull()
})
