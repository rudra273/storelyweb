import { useEffect, useState, type ReactNode } from 'react'
import { DISCARD, DirtyContext, type Registry } from './dirty'

/** Tracks forms with unsaved edits so a shop switch or a closing tab cannot lose them silently. */
export function DirtyProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(() => {
    const ids = new Set<string>()
    return {
      ids,
      value: {
        mark: (id: string, dirty: boolean) => { if (dirty) ids.add(id); else ids.delete(id) },
        confirmLeave: (message = DISCARD) => ids.size === 0 || window.confirm(message),
      } satisfies Registry,
    }
  })
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (registry.ids.size) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [registry])
  return <DirtyContext.Provider value={registry.value}>{children}</DirtyContext.Provider>
}
