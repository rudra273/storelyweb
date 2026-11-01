import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ThemeContext } from './context'
import { THEME_KEY, applyTheme, readPreference, resolveTheme, savePreference, type ThemePreference } from './theme'

const query = () => (typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null)

/** Light, Dark or System. Changing it re-themes the page in place, so nothing on screen is lost. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference)
  const [systemDark, setSystemDark] = useState(() => query()?.matches ?? false)

  useEffect(() => {
    const media = query()
    if (!media) return
    const change = () => setSystemDark(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])

  // Another tab changed the choice.
  useEffect(() => {
    const sync = (e: StorageEvent) => { if (e.key === THEME_KEY || e.key === null) setPreferenceState(readPreference()) }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const resolved = resolveTheme(preference, systemDark)
  useEffect(() => applyTheme(resolved), [resolved])

  const setPreference = useCallback((next: ThemePreference) => {
    savePreference(next)
    setPreferenceState(next)
  }, [])

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
