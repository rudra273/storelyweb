import { useCallback, useState } from 'react'
import { ApiError } from '../api/client'

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429 && error.retryAfter) {
      return `${error.message} Try again in ${error.retryAfter} seconds.`
    }
    return error.message
  }
  return 'Something went wrong. Please try again.'
}

/** Runs a form submit or button click, tracking busy and error state. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true)
    setError(null)
    try {
      return await work()
    } catch (e) {
      setError(describeError(e))
      return undefined
    } finally {
      setBusy(false)
    }
  }, [])
  return { busy, error, run, setError }
}
