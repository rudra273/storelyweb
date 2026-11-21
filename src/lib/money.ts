// The API sends money and quantities as decimal strings ("25.5"). They are only turned
// into numbers here, for display; nothing is calculated from the result.
const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
const plain = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 })

export function formatMoney(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  return Number.isFinite(n) ? rupees.format(n) : '—'
}

export function formatQty(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  return Number.isFinite(n) ? plain.format(n) : '—'
}

/** A form field's text to what the API expects: blank -> null, otherwise the trimmed text. */
export function decimalOrNull(text: string): string | null {
  const t = text.trim()
  return t === '' ? null : t
}

/** True for text the API will accept as a non-negative decimal (up to 4 places). */
export function isAmount(text: string): boolean {
  return /^\d{1,9}(\.\d{1,4})?$/.test(text.trim())
}

const toPaise = (text: string): number => Math.round(Number(text) * 100)

/** Cash handed over minus what is owed, for the counter only ("give back ₹x"). The saved
 * payment never uses it: the server records what is due, capped, and that stays the record. */
export function changeToReturn(received: string, owed: string): string | null {
  return excess(received, owed)
}

/** What is still unpaid after a part payment, shown beside the field. The server's figure is the record. */
export function balanceAfter(total: string, paidNow: string): string | null {
  return excess(total, paidNow)
}

function excess(larger: string, smaller: string): string | null {
  if (!isAmount(larger) || !isAmount(smaller)) return null
  const diff = toPaise(larger) - toPaise(smaller)
  return diff > 0 ? (diff / 100).toFixed(2) : null
}
