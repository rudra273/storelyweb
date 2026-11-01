const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Preserve exact receipt decimals, including subtotals above Number.MAX_SAFE_INTEGER. */
export function receiptMoney(value: string): string {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) return '—'
  const [whole = '0', fraction = ''] = value.split('.')
  const digits = fraction.replace(/0+$/, '').padEnd(2, '0')
  return currency.formatToParts(BigInt(whole)).map(part => part.type === 'fraction' ? digits : part.value).join('')
}
