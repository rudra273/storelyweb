/** Sale-only contract. Purchase quantities and stock retain their own precision.
 * Keep raw editor/draft text; normalize only when building a new request.
 */
export const SALE_QUANTITY_ERROR = 'Enter a quantity above 0, up to 1,000,000, with up to 3 decimal places.'

export function saleQuantity(raw: string): string | null {
  const value = raw.trim()
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null
  const [whole = '', fraction = ''] = value.split('.')
  const integer = whole.replace(/^0+(?=\d)/, '')
  const decimal = fraction.replace(/0+$/, '')
  if (decimal.length > 3 || integer.length > 7) return null
  if (BigInt(integer) > 1000000n || (integer === '1000000' && decimal)) return null
  if (BigInt(integer) === 0n && !decimal) return null
  return decimal ? `${integer}.${decimal}` : integer
}

/** Blank and any plain decimal zero mean an unselected return line. */
export function returnQuantity(raw: string): string | null {
  const text = raw.trim()
  return text === '' || /^0+(?:\.0+)?$/.test(text) ? '0' : saleQuantity(text)
}

/** Exact decimal comparison with server-supplied remaining quantity. */
export function exceedsReturnQuantity(quantity: string, remaining: string): boolean {
  const [whole, fraction = ''] = quantity.split('.')
  const [limitWhole, limitFraction = ''] = remaining.split('.')
  const scale = Math.max(fraction.length, limitFraction.length)
  return BigInt(whole! + fraction.padEnd(scale, '0')) > BigInt(limitWhole! + limitFraction.padEnd(scale, '0'))
}
