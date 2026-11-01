import { createContext, useCallback, useContext, useEffect, useId, useState } from 'react'

export const DISCARD = 'Discard your unsaved changes?'

export interface Registry {
  mark: (id: string, dirty: boolean) => void
  /** True when nothing is unsaved, or the person agrees to lose it. */
  confirmLeave: (message?: string) => boolean
}

export const DirtyContext = createContext<Registry | null>(null)

/** For the shell: ask before something throws away every open form (switching shop). */
export function useConfirmLeave() {
  return useContext(DirtyContext)?.confirmLeave ?? (() => true)
}

/** Registers a form's unsaved state and returns a close that asks first when it is dirty. */
export function useDirtyClose(dirty: boolean, close: () => void): () => void {
  const registry = useContext(DirtyContext)
  const id = useId()
  useEffect(() => {
    registry?.mark(id, dirty)
    return () => registry?.mark(id, false)
  }, [registry, id, dirty])
  return useCallback(() => {
    if (!dirty || window.confirm(DISCARD)) close()
  }, [dirty, close])
}

/** True once `value` differs from what it was when the form first opened. */
export function useIsDirty(value: unknown): boolean {
  const [first] = useState(() => JSON.stringify(value))
  return JSON.stringify(value) !== first
}
