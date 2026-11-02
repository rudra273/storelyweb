import { formatMoney } from '../lib/money'
import type { BillDetail } from './queries'

/** A phone number as WhatsApp wants it: digits only, with a country code.
 * A bare 10-digit number is taken as Indian (91). Returns null when it cannot be a number. */
export function whatsappNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^00/, '')
  const full = digits.length === 10 ? `91${digits}` : digits.length === 11 && digits.startsWith('0') ? `91${digits.slice(1)}` : digits
  return /^\d{11,15}$/.test(full) ? full : null
}

/** The first draft of the message; the person reviews and edits it before WhatsApp opens. */
export function shareMessage(detail: BillDetail, shopName: string): string {
  const b = detail.bill
  const lines = [`${shopName}`, `Invoice ${b.bill_number} · ${formatMoney(b.total_amount)}`]
  if (Number(b.balance_due) > 0) lines.push(`Balance due: ${formatMoney(b.balance_due)}`)
  else lines.push('Paid in full. Thank you!')
  return lines.join('\n')
}

/** wa.me opens a chat with the text typed in. It cannot attach a file or send anything itself. */
export function whatsappLink(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}
