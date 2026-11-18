/** Synchronous persistence is a precondition for sending a financial operation.
 * Keeps the existing draft envelope/key so older saved invoices remain recoverable.
 * Only the owner of the last observed record may replace or clear it. */
export class InvoiceDraftError extends Error {
  readonly kind: 'storage' | 'conflict' | 'unreadable'
  constructor(kind: 'storage' | 'conflict' | 'unreadable', message: string) { super(message); this.kind = kind }
}

const STORAGE_ERROR = 'Your invoice could not be saved in this browser. Enable browser storage or free space, then retry. This attempt has not been sent. Keep any previously unconfirmed invoice and retry it with the same request.'
const CONFLICT_ERROR = 'This invoice draft changed in another tab. Reload to review the saved draft before continuing.'

export function openInvoiceDraft<T extends { attempt: unknown }>(userId: string, shopId: string, validate?: (value: unknown) => value is T) {
  const key = `storely.draft.bill.${userId}.${shopId}`
  let expected: string | null = null
  let initial: { data: T; savedAt: number } | null = null
  let initialError: InvoiceDraftError | null = null
  try {
    expected = localStorage.getItem(key)
    if (expected !== null) {
      if (expected.length > 2_000_000) throw new Error('Draft too large')
      const value = JSON.parse(expected)
      if (value.v !== 1 || !Number.isFinite(value.savedAt) || !value.data || typeof value.data !== 'object') throw new Error('Invalid draft')
      if (validate && !validate(value.data)) throw new Error('Invalid invoice draft')
      // A potentially committed operation must never disappear due to draft age.
      if (value.data.attempt || Date.now() - value.savedAt <= 7 * 24 * 60 * 60 * 1000) initial = { data: value.data as T, savedAt: value.savedAt }
    }
  } catch {
    initialError = new InvoiceDraftError('unreadable', 'The saved invoice could not be read. Restore browser storage access and reload before creating another invoice.')
  }
  function current() {
    if (initialError) throw initialError
    try {
      if (localStorage.getItem(key) !== expected) throw new InvoiceDraftError('conflict', CONFLICT_ERROR)
    } catch (error) {
      if (error instanceof InvoiceDraftError) throw error
      throw new InvoiceDraftError('storage', STORAGE_ERROR)
    }
  }
  return {
    initial,
    initialError,
    save(data: T) {
      current()
      const next = JSON.stringify({ v: 1, savedAt: Date.now(), data })
      try {
        localStorage.setItem(key, next)
        if (localStorage.getItem(key) !== next) throw new InvoiceDraftError('conflict', CONFLICT_ERROR)
        expected = next
      } catch (error) {
        if (error instanceof InvoiceDraftError) throw error
        throw new InvoiceDraftError('storage', STORAGE_ERROR)
      }
    },
    clear() {
      current()
      try {
        localStorage.removeItem(key)
        if (localStorage.getItem(key) !== null) throw new InvoiceDraftError('conflict', CONFLICT_ERROR)
        expected = null
      } catch (error) {
        if (error instanceof InvoiceDraftError) throw error
        throw new InvoiceDraftError('storage', 'The completed invoice is saved, but its browser draft could not be cleared. Restore storage access before starting another invoice.')
      }
    },
  }
}
