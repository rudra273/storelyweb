import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ThemeContext } from './context'
import { ThemeScopeContext } from './scope'
import { createWorkspaceTheme, workspaceThemeKey, type WorkspaceThemeState } from './workspaceThemeSession'
import { THEME_KEY, applyTheme, readPreference, resolveTheme, savePreference, type ThemePreference } from './theme'

const query = () => (typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null)

/** One DOM theme writer; guest choice never becomes a workspace preference. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [guest, setGuest] = useState<ThemePreference>(readPreference)
  const guestNow = useRef(guest)
  const [systemDark, setSystemDark] = useState(() => query()?.matches ?? false)
  type Controller = ReturnType<typeof createWorkspaceTheme>
  const controller = useRef<Controller | null>(null)
  const localScopes = useRef(new Map<string, ThemePreference>())
  const [workspace, setWorkspace] = useState<{ owner: Controller; state: WorkspaceThemeState } | null>(null)

  useEffect(() => {
    const media = query()
    if (!media) return
    const change = () => setSystemDark(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])

  const bind = useCallback((user: string, shop: string, enabled: boolean, pending: boolean) => {
    controller.current?.dispose()
    const key = workspaceThemeKey(user, shop)
    const owner = createWorkspaceTheme(user, shop, enabled, state => {
      if (controller.current !== owner) return
      if (!enabled && !pending) localScopes.current.set(key, state.preference)
      setWorkspace({ owner, state })
    }, { pending, localPreference: localScopes.current.get(key) })
    controller.current = owner
    setWorkspace({ owner, state: owner.state })
    applyTheme(resolveTheme(owner.state.preference, query()?.matches ?? false))
    void owner.load()
    return () => {
      owner.dispose()
      if (controller.current !== owner) return
      controller.current = null; setWorkspace(null)
      applyTheme(resolveTheme(guestNow.current, query()?.matches ?? false))
    }
  }, [])

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) {
        const next = readPreference(); guestNow.current = next; setGuest(next)
      }
      if (controller.current && (event.key === controller.current.key || event.key === null)) void controller.current.load()
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const preference = workspace?.state.preference ?? guest
  const resolved = resolveTheme(preference, systemDark)
  useEffect(() => applyTheme(resolved), [resolved])
  const owner = workspace?.owner
  const setPreference = useCallback((next: ThemePreference) => {
    if (owner) {
      if (controller.current === owner) owner.choose(next)
    } else if (!controller.current) {
      savePreference(next); guestNow.current = next; setGuest(next)
    }
  }, [owner])
  const retry = useCallback(() => { if (owner && controller.current === owner) owner.retry() }, [owner])
  const value = useMemo(() => ({ preference, resolved, setPreference, retry, pending: workspace?.state.pending ?? null, error: workspace?.state.error ?? null, disabled: workspace?.owner.disabled ?? false }), [preference, resolved, setPreference, retry, workspace])
  return <ThemeScopeContext.Provider value={bind}><ThemeContext.Provider value={value}>{children}</ThemeContext.Provider></ThemeScopeContext.Provider>
}
