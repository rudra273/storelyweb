import { useRef } from 'react'

/** A retry key for one create form. The same key goes with the same request, so pressing
 * Save again after a lost response replays it instead of adding a second record; changing
 * the details asks for a new key. */
export function useRetryKey(): (body: unknown) => string {
  const last = useRef<{ fingerprint: string; key: string } | null>(null)
  return body => {
    const fingerprint = JSON.stringify(body)
    if (last.current?.fingerprint !== fingerprint) last.current = { fingerprint, key: crypto.randomUUID() }
    return last.current.key
  }
}
