import { useEffect, useRef, useState } from 'react'

/** After a submit with mistakes, move focus to the first field marked invalid. The field
 * errors render first, so the focus waits for that render (an effect), not the submit. */
export function useFirstError<T extends HTMLElement = HTMLFormElement>() {
  const ref = useRef<T>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (tick) ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [tick])
  return { ref, focusFirstError: () => setTick(t => t + 1) }
}
