import { formatMoney, formatQty, toPaise } from '../lib/money'
import type { BillDetail } from './queries'

/** A phone number as WhatsApp wants it: digits only, with a country code.
 * A bare 10-digit number is taken as Indian (91). Returns null when it cannot be a number. */
export function whatsappNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^00/, '')
  const full = digits.length === 10 ? `91${digits}` : digits.length === 11 && digits.startsWith('0') ? `91${digits.slice(1)}` : digits
  return /^\d{11,15}$/.test(full) ? full : null
}

type ShareBill = BillDetail['bill'] & {
  discount_mode?: 'percent' | 'amount'
  discount_value?: string
  notes?: string | null
}

type ShareItem = BillDetail['items'][number] & {
  discount_amount?: string
}

/** The first draft of the message; the person reviews and edits it before WhatsApp opens. */
export function shareMessage(detail: BillDetail, shopName: string): string {
  const b = detail.bill as ShareBill
  const items = (detail.items ?? []) as ShareItem[]
  const header = b.cancelled
    ? `VOID Invoice ${b.bill_number}${b.cancel_reason ? ` (${b.cancel_reason})` : ''} · ${formatMoney(b.total_amount)}`
    : `Invoice ${b.bill_number} · ${formatMoney(b.total_amount)}`
  const lines = [`${shopName}`, header]

  const lineDiscTotal = items.reduce((sum, i) => sum + (toPaise(i.discount_amount) ?? 0n), 0n)
  if (lineDiscTotal > 0n) {
    const rupees = (Number(lineDiscTotal) / 100).toFixed(2)
    lines.push(`Line discounts: ${formatMoney(rupees)}`)
  }
  const docDiscPaise = toPaise(b.discount_amount) ?? 0n
  if (docDiscPaise > 0n) {
    const label =
      b.discount_mode === 'amount' && (toPaise(b.discount_value) ?? 0n) > 0n
        ? `Discount (${formatMoney(b.discount_value)} off): ${formatMoney(b.discount_amount)}`
        : Number(b.discount_value ?? b.discount_percent) > 0
          ? `Discount (${formatQty(b.discount_value ?? b.discount_percent)}%): ${formatMoney(b.discount_amount)}`
          : `Discount: ${formatMoney(b.discount_amount)}`
    lines.push(label)
  }

  if (b.cancelled) {
    lines.push('This invoice has been voided.')
  } else if (Number(b.balance_due) > 0) {
    lines.push(`Balance due: ${formatMoney(b.balance_due)}`)
  } else {
    lines.push('Paid in full. Thank you!')
  }
  if (b.notes?.trim()) {
    lines.push(`Notes: ${b.notes.trim()}`)
  }
  return lines.join('\n')
}

/** wa.me opens a chat with the text typed in. It cannot attach a file or send anything itself. */
export function whatsappLink(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}
