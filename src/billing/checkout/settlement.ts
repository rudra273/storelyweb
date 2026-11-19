/** Compare payable amounts without converting decimal text to binary floating point.
 * PaymentIn accepts at most two fractional places and a maximum of 999999999. */
export function paymentMinorUnits(text: string): bigint | null {
  const value = text.trim()
  if (!/^\d{1,30}(\.\d{1,2})?$/.test(value)) return null
  const [whole = '', fraction = ''] = value.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

export function validPartialPayment(amount: string, total: string): boolean {
  const paid = paymentMinorUnits(amount)
  const due = paymentMinorUnits(total)
  return paid !== null && due !== null && paid > 0n && paid <= 99999999900n && paid < due
}
