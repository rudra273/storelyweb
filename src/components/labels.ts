import { PAYMENT_STATUS } from '../lib/vocabulary'
/** Words for the codes and dates the API sends, so the screens never show raw values
 * ("2026-11-01", "partial", "upi", "own_use"). One place, the same everywhere. */

const DAY = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

/** "2026-11-01" or an ISO timestamp → "1 Nov 2026". Unknown text is returned as is. */
export function day(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : DAY.format(date)
}

/** "1 Nov 2026" or "1 – 30 Nov 2026" for a period. */
export function dayRange(from: string, to: string): string {
  return from === to ? day(from) : `${day(from)} – ${day(to)}`
}

function words(code: string): string {
  const text = code.replace(/_/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const METHODS: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank transfer', online: 'Online', credit: 'Credit', cheque: 'Cheque' }
export const paymentMethod = (code: string | null | undefined) => (code ? METHODS[code] ?? words(code) : '—')

export const paymentStatus = (code: string) => PAYMENT_STATUS[code] ?? words(code)

const ROLES: Record<string, string> = { owner: 'Owner', admin: 'Admin', staff: 'Staff' }
export const roleLabel = (code: string) => ROLES[code] ?? words(code)

const REASONS: Record<string, string> = { damage: 'Damaged', expired: 'Expired', theft: 'Lost / theft', return: 'Customer return', own_use: 'Own use', count: 'Stock count corrected', other: 'Other' }
export const stockReason = (code: string | null | undefined) => (code ? REASONS[code] ?? words(code) : '')

const ACTIONS: Record<string, string> = { created: 'Created', payment: 'Payment recorded', cancelled: 'Voided', credit_note: 'Items returned', refund: 'Refund' }
export const billAction = (code: string) => ACTIONS[code] ?? words(code)
