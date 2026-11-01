import { useCallback, useState } from 'react'
import { describeError, fieldErrorsOf } from './errorText'

export { describeError } from './errorText'

/** Runs a form submit or button click, tracking busy and error state. `fieldErrors` holds the
 * server's per-field complaints (keyed by API field name) so a form can show them inline. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const run = useCallback(async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true)
    setError(null)
    setFieldErrors({})
    try {
      return await work()
    } catch (e) {
      setError(describeError(e))
      setFieldErrors(fieldErrorsOf(e))
      return undefined
    } finally {
      setBusy(false)
    }
  }, [])
  return { busy, error, run, setError, fieldErrors, setFieldErrors }
}
