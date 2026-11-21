import type { components } from '../../api/schema'
import { FinancialStorageError, withFinancialStorageLock } from '../../lib/financialStorage'

export type SupplierPaymentAttempt = Omit<components['schemas']['SupplierPaymentIn'], 'amount'> & { amount: string }
type Payment = SupplierPaymentAttempt
const STORAGE = 'The payment request could not be saved in this browser. Restore storage access and retry the same payment. This attempt was not sent; a previously unconfirmed payment may already be recorded.'
const CONFLICT = 'This supplier payment changed in another tab. Close and reopen the payment to review the saved request before continuing.'
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
function validPayment(value: unknown): value is Payment {
  if (!record(value)) return false
  const allowed = ['request_key', 'payment_date', 'amount', 'payment_method', 'reference', 'notes', 'purchase_uuid']
  return Object.keys(value).every(key => allowed.includes(key)) &&
    typeof value.request_key === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value.request_key) &&
    typeof value.payment_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.payment_date) &&
    typeof value.amount === 'string' && /^\d{1,12}(\.\d{1,2})?$/.test(value.amount) && /[1-9]/.test(value.amount) &&
    ['cash', 'upi', 'card', 'bank_transfer', 'online'].includes(String(value.payment_method)) &&
    (value.reference == null || typeof value.reference === 'string' && value.reference.length <= 100) &&
    (value.notes == null || typeof value.notes === 'string' && value.notes.length <= 500) &&
    (value.purchase_uuid == null || typeof value.purchase_uuid === 'string' && value.purchase_uuid.length > 0 && value.purchase_uuid.length <= 64)
}

/** One supplier-wide pending request, including legacy purchase-scoped keys.
 * Raw payment bodies remain compatible; restored requests are always uncertain. */
export function openPaymentAttempt(user: string, shop: string, supplier: string) {
  const base = `storely.supplier-payment:${user}:${shop}:${supplier}`
  function snapshot() {
    const rows: Record<string, string> = {}
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (key && (key === base || key.startsWith(base + ':'))) {
        const value = localStorage.getItem(key)
        if (value !== null) rows[key] = value
      }
    }
    return Object.fromEntries(Object.entries(rows).sort(([left], [right]) => left.localeCompare(right)))
  }
  let expected: Record<string, string> = {}
  let initial: Payment | null = null
  let initialError: FinancialStorageError | null = null
  try {
    expected = snapshot()
    const entries = Object.entries(expected)
    if (entries.length > 1) throw new Error('Multiple pending payments')
    if (entries.length === 1) {
      const [key, raw] = entries[0]!
      if (raw.length > 16000) throw new Error('Oversized payment')
      const data: unknown = JSON.parse(raw)
      if (!validPayment(data) || key !== base && key !== `${base}:${data.purchase_uuid}`) throw new Error('Invalid payment')
      initial = data
    }
  } catch {
    initialError = new FinancialStorageError('unreadable', 'The saved supplier payment cannot be safely read, or several unconfirmed payments exist. Review the supplier statement and restore browser storage before recording another payment. Saved requests have been kept.')
  }
  function current(isActive: () => boolean) {
    if (!isActive()) throw new FinancialStorageError('storage', 'Payment cancelled because this editor was closed. This attempt was not sent.')
    if (initialError) throw initialError
    try {
      if (JSON.stringify(snapshot()) !== JSON.stringify(expected)) throw new FinancialStorageError('conflict', CONFLICT)
    } catch (error) {
      if (error instanceof FinancialStorageError) throw error
      throw new FinancialStorageError('storage', STORAGE)
    }
  }
  return {
    initial,
    initialError,
    async save(body: Payment, isActive: () => boolean) {
      await withFinancialStorageLock(base, 'supplier payment', () => {
        current(isActive)
        const keys = Object.keys(expected)
        const prior = keys.length ? JSON.parse(expected[keys[0]!]!) : null
        if (prior && JSON.stringify(prior) !== JSON.stringify(body)) throw new FinancialStorageError('conflict', CONFLICT)
        const key = keys[0] ?? base
        const raw = JSON.stringify(body)
        try {
          localStorage.setItem(key, raw)
          const next = { [key]: raw }
          if (JSON.stringify(snapshot()) !== JSON.stringify(next)) throw new FinancialStorageError('conflict', CONFLICT)
          expected = next
        } catch (error) {
          if (error instanceof FinancialStorageError) throw error
          throw new FinancialStorageError('storage', STORAGE)
        }
      })
    },
    async clear(isActive: () => boolean) {
      await withFinancialStorageLock(base, 'supplier payment', () => {
        current(isActive)
        try {
          for (const key of Object.keys(expected)) {
            localStorage.removeItem(key)
            if (localStorage.getItem(key) !== null) throw new FinancialStorageError('conflict', CONFLICT)
            delete expected[key]
          }
        } catch (error) {
          if (error instanceof FinancialStorageError) throw error
          throw new FinancialStorageError('storage', 'The saved browser payment request could not be cleared. Restore storage access and retry this same request before recording another payment.')
        }
      })
    },
  }
}
