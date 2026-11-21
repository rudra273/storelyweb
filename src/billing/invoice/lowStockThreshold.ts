import type { InvoiceSettings } from '../queries'

/** UI writes accept only plain ASCII decimals; preserve untouched legacy values. */
export function lowStockThresholdProblem(base: InvoiceSettings, mine: InvoiceSettings): string | undefined {
  if ((base.low_stock_threshold ?? '') === (mine.low_stock_threshold ?? '')) return
  const text = String(mine.low_stock_threshold ?? '').replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '')
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(text)) {
    const [integer = '', tail = ''] = text.split('.')
    const whole = integer.replace(/^0+(?=[0-9])/, '')
    const fraction = tail.replace(/0+$/, '')
    if (fraction.length <= 4 && (whole.length < 9 || (whole.length === 9 && (whole < '999999999' || (whole === '999999999' && !fraction))))) return
  }
  return 'Enter a low-stock threshold from 0 to 999999999 with at most four decimal places.'
}
