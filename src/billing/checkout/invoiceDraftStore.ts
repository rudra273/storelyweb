/** All editable and held work for one user/shop moves in one durable record.
 * v1 active-only records remain readable. An uncertain request is never a held clone. */
import { FinancialStorageError as InvoiceDraftError, withFinancialStorageLock } from '../../lib/financialStorage'
export { FinancialStorageError as InvoiceDraftError } from '../../lib/financialStorage'

const STORAGE_ERROR = 'Your invoice could not be saved in this browser. Enable browser storage or free space, then retry. This attempt has not been sent. Keep any previously unconfirmed invoice and retry it with the same request.'
const CONFLICT_ERROR = 'This invoice draft changed in another tab. Reload to review the saved draft before continuing.'
const MAX_HELD = 20
export interface HeldInvoice<T> { id: string; savedAt: number; data: T }

export function openInvoiceDraft<T extends { attempt: unknown }>(userId: string, shopId: string, validate?: (value: unknown) => value is T) {
  const key = `storely.draft.bill.${userId}.${shopId}`
  type Envelope = { v: 1; savedAt: number; data: T | null; held: HeldInvoice<T>[] }
  let expected: string | null = null
  let envelope: Envelope | null = null
  let initialError: InvoiceDraftError | null = null
  let retired = false
  const valid = (data: unknown): data is T => !!data && typeof data === 'object' && !Array.isArray(data) && (!validate || validate(data))
  try {
    expected = localStorage.getItem(key)
    if (expected !== null) {
      if (expected.length > 2_000_000) throw new Error('Draft too large')
      const value = JSON.parse(expected)
      if (value.v !== 1 || !Number.isFinite(value.savedAt) || (value.data !== null && !valid(value.data))) throw new Error('Invalid draft')
      const held: HeldInvoice<T>[] = value.held ?? []
      if (!Array.isArray(held) || held.length > MAX_HELD || held.some(item => !item || typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(item.id) || !Number.isFinite(item.savedAt) || !valid(item.data) || !!item.data.attempt) || new Set(held.map(item => item.id)).size !== held.length) throw new Error('Invalid held invoices')
      envelope = { ...value, held }
    }
  } catch {
    initialError = new InvoiceDraftError('unreadable', 'The saved invoice could not be read. Restore browser storage access and reload before creating another invoice.')
  }
  const exclusive = (work: () => void) => withFinancialStorageLock(key, 'invoice', work)
  function current(isActive?: () => boolean) {
    if (isActive && !isActive()) throw new InvoiceDraftError('storage', 'Invoice save cancelled because checkout was closed. No request was sent.')
    if (initialError) throw initialError
    if (retired) throw new InvoiceDraftError('conflict', CONFLICT_ERROR)
    try {
      if (localStorage.getItem(key) !== expected) throw new InvoiceDraftError('conflict', CONFLICT_ERROR)
    } catch (error) {
      if (error instanceof InvoiceDraftError) throw error
      throw new InvoiceDraftError('storage', STORAGE_ERROR)
    }
  }
  function write(data: T | null, held = envelope?.held ?? []) {
    const next: Envelope | null = data === null && !held.length ? null : { v: 1, savedAt: Date.now(), data, held }
    const serialized = next === null ? null : JSON.stringify(next)
    if (serialized && serialized.length > 2_000_000) throw new InvoiceDraftError('storage', 'The saved invoices exceed browser storage limits. Keep this invoice open and explicitly discard held work you no longer need before retrying.')
    try {
      if (serialized === null) localStorage.removeItem(key)
      else localStorage.setItem(key, serialized)
      if (localStorage.getItem(key) !== serialized) throw new InvoiceDraftError('conflict', CONFLICT_ERROR)
      expected = serialized
      envelope = next
    } catch (error) {
      if (error instanceof InvoiceDraftError) throw error
      throw new InvoiceDraftError('storage', STORAGE_ERROR)
    }
  }
  function editable(data: T | null) {
    if (envelope?.data?.attempt || data?.attempt) throw new InvoiceDraftError('conflict', 'Resolve the previously unconfirmed invoice before holding, resuming or discarding held work.')
  }
  return {
    initial: envelope?.data ? { data: envelope.data, savedAt: envelope.savedAt } : null,
    initialHeld: envelope?.held ?? [],
    initialError,
    async save(data: T, options: { releaseAttempt?: boolean; isActive?: () => boolean } = {}) {
      await exclusive(() => {
        current(options.isActive)
        const previous = envelope?.data?.attempt
        if (previous && !options.releaseAttempt && JSON.stringify(previous) !== JSON.stringify(data.attempt)) throw new InvoiceDraftError('conflict', 'Resolve the previously unconfirmed invoice before replacing its saved request.')
        write(data)
      })
    },
    async clear(options: { completed?: boolean; isActive?: () => boolean } = {}) {
      await exclusive(() => {
        current(options.isActive)
        if (envelope?.data?.attempt && !options.completed) throw new InvoiceDraftError('conflict', 'Resolve the previously unconfirmed invoice before clearing its saved request.')
        try { write(null) }
        catch (error) {
          if (error instanceof InvoiceDraftError && error.kind === 'storage') throw new InvoiceDraftError('storage', 'The invoice draft could not be cleared. Restore browser storage access before starting another invoice. Your saved work is kept.')
          throw error
        }
      })
    },
    async hold(data: T, options: { isActive?: () => boolean } = {}) {
      await exclusive(() => {
        current(options.isActive); editable(data)
        const held = envelope?.held ?? []
        if (held.length >= MAX_HELD) throw new InvoiceDraftError('storage', 'You have 20 held invoices. Resume or explicitly discard one before holding another.')
        write(null, [...held, { id: crypto.randomUUID(), savedAt: Date.now(), data }])
        retired = true
      })
    },
    async resume(id: string, active: T | null, options: { isActive?: () => boolean } = {}) {
      await exclusive(() => {
        current(options.isActive); editable(active)
        const held = envelope?.held ?? []
        const selected = held.find(item => item.id === id)
        if (!selected) throw new InvoiceDraftError('conflict', CONFLICT_ERROR)
        const remaining = held.filter(item => item.id !== id)
        if (active) remaining.push({ id: crypto.randomUUID(), savedAt: Date.now(), data: active })
        write(selected.data, remaining)
        retired = true
      })
    },
    async discardHeld(id: string, active: T | null, options: { isActive?: () => boolean } = {}) {
      await exclusive(() => {
        current(options.isActive); editable(active)
        const held = envelope?.held ?? []
        if (!held.some(item => item.id === id)) throw new InvoiceDraftError('conflict', CONFLICT_ERROR)
        write(active, held.filter(item => item.id !== id))
        retired = true
      })
    },
  }
}
