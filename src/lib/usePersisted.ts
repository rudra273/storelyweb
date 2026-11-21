import { useCallback, useState } from 'react'

/** A UI preference remembered in this browser (never business data). Falls back quietly if storage is blocked. */
export function usePersisted<T>(key: string, fallback: T, valid: (value: unknown) => value is T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return fallback
      const parsed: unknown = JSON.parse(raw)
      return valid(parsed) ? parsed : fallback
    } catch {
      return fallback
    }
  })
  const set = useCallback((next: T) => {
    setValue(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* the choice lasts until the page closes */ }
  }, [key])
  return [value, set]
}
