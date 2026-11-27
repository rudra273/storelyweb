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

/** Parse a decimal string into exact minor units (paise) using BigInt with half-away-from-zero rounding. */
export function toPaise(text: string | null | undefined): bigint | null {
  if (text === null || text === undefined) return null
  const trimmed = text.trim()
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) return null
  const negative = trimmed.startsWith('-')
  const unsigned = negative ? trimmed.slice(1) : trimmed
  const [whole = '0', frac = ''] = unsigned.split('.')
  const padded = frac.padEnd(3, '0')
  let paise = BigInt(whole) * 100n + BigInt(padded.slice(0, 2))
  if (Number(padded[2]!) >= 5) paise += 1n
  return negative ? -paise : paise
}

/** Format exact minor units (paise) as a fixed 2-decimal rupee string (e.g. 1234n -> "12.34"). */
export function paiseToDecimal(paise: bigint): string {
  const negative = paise < 0n
  const abs = negative ? -paise : paise
  const whole = abs / 100n
  const frac = String(abs % 100n).padStart(2, '0')
  return `${negative ? '-' : ''}${whole}.${frac}`
}

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
  const a = toPaise(larger)
  const b = toPaise(smaller)
  if (a === null || b === null) return null
  const diff = a - b
  return diff > 0n ? paiseToDecimal(diff) : null
}
