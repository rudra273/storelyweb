import { useEffect, useRef } from 'react'

/** A checkbox with a "some" state (the browser's indeterminate dash) for a select-all header. */
export function TriCheckbox({ state, label, onChange }: { state: 'none' | 'some' | 'all'; label: string; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = state === 'some' }, [state])
  return <input ref={ref} type="checkbox" aria-label={label} checked={state === 'all'} aria-checked={state === 'some' ? 'mixed' : state === 'all'} onChange={onChange} />
}
