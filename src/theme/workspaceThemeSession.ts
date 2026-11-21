import type { components } from '../api/schema'
import { api, request } from '../api/client'
import type { ThemePreference } from './theme'

type ThemeDto = components['schemas']['ThemePreference']
export interface WorkspaceThemeState { preference: ThemePreference; pending: 'loading' | 'saving' | null; error: string | null }
export const workspaceThemeKey = (user: string, shop: string) => `storely.theme.workspace.${encodeURIComponent(JSON.stringify([user, shop]))}`
const known = (value: unknown): value is ThemePreference => value === 'system' || value === 'light' || value === 'dark'
function received(value: ThemeDto): ThemePreference {
  if (!value || !known(value.theme)) throw new Error('Unsupported appearance response')
  return value.theme
}
function cached(key: string): ThemePreference {
  try { const value = localStorage.getItem(key); return known(value) ? value : 'system' } catch { return 'system' }
}

/** One mounted user/shop session. Confirmed cache only; failed choices remain session-local. */
export function createWorkspaceTheme(user: string, shop: string, enabled: boolean, publish: (state: WorkspaceThemeState) => void, options: { pending?: boolean; localPreference?: ThemePreference } = {}) {
  const key = workspaceThemeKey(user, shop)
  const path = `/v1/shops/${encodeURIComponent(shop)}/preferences/theme`
  const abort = new AbortController()
  let active = true
  let version = 0
  let read = 0
  let tail = Promise.resolve()
  let errorKind: 'load' | 'save' | null = null
  let state: WorkspaceThemeState = { preference: !enabled && options.localPreference ? options.localPreference : cached(key), pending: enabled ? 'loading' : null, error: null }
  function update(next: WorkspaceThemeState) { if (active) { state = next; publish(next) } }
  function confirm(theme: ThemePreference) {
    try { localStorage.setItem(key, theme) } catch { /* Cloud confirmation remains authoritative. */ }
  }
  async function load() {
    if (!active || !enabled || state.pending === 'saving' || errorKind === 'save') return
    const started = version
    const requestId = ++read
    update({ ...state, pending: 'loading', error: null })
    try {
      const theme = received(await api.get<ThemeDto>(path, { signal: abort.signal }))
      if (!active || version !== started || requestId !== read) return
      errorKind = null; confirm(theme)
      update({ preference: theme, pending: null, error: null })
    } catch {
      if (!active || version !== started || requestId !== read) return
      errorKind = 'load'
      update({ ...state, pending: null, error: 'Appearance could not be loaded. Your current choice is kept. Try again.' })
    }
  }
  function choose(theme: ThemePreference) {
    if (!active || options.pending || !known(theme)) return
    if (!enabled) { update({ preference: theme, pending: null, error: null }); return }
    const started = ++version
    errorKind = null
    update({ preference: theme, pending: 'saving', error: null })
    // Last local choice wins. A queued write must not start after its scope leaves.
    tail = tail.then(async () => {
      if (!active || version !== started) return
      try {
        const body: ThemeDto = { theme }
        const saved = received(await request<ThemeDto>('PUT', path, { body, signal: abort.signal }))
        if (saved !== theme) throw new Error('Appearance was not confirmed')
        if (!active || version !== started) return
        errorKind = null; confirm(saved)
        update({ preference: saved, pending: null, error: null })
      } catch {
        if (!active || version !== started) return
        errorKind = 'save'
        update({ ...state, pending: null, error: 'Appearance is applied here but could not be saved to this workspace. Try again.' })
      }
    })
  }
  return {
    key, enabled, disabled: !!options.pending,
    get state() { return state },
    load, choose,
    retry() { if (errorKind === 'save') choose(state.preference); else void load() },
    dispose() { active = false; abort.abort() },
  }
}
