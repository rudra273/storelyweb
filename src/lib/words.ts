const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function belowHundred(n: number): string {
  return n < 20 ? ONES[n]! : [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(' ')
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100)
  return [hundreds ? `${ONES[hundreds]} Hundred` : '', belowHundred(n % 100)].filter(Boolean).join(' ')
}

/** Whole number in the Indian system: crore, lakh, thousand. */
function indian(n: number): string {
  if (n === 0) return 'Zero'
  const parts: string[] = []
  const crore = Math.floor(n / 10_000_000)
  const lakh = Math.floor((n % 10_000_000) / 100_000)
  const thousand = Math.floor((n % 100_000) / 1000)
  if (crore) parts.push(`${indian(crore)} Crore`)
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`)
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`)
  if (n % 1000) parts.push(belowThousand(n % 1000))
  return parts.join(' ')
}

/** "223.50" → "Rupees Two Hundred Twenty Three and Fifty Paise Only". Works on the
 * server's decimal text, never on a float, so the words match the printed figure. */
export function amountInWords(amount: string): string {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?/.exec(amount.trim())
  if (!match) return ''
  const rupees = Number(match[2])
  const paise = Number((match[3] ?? '0').padEnd(2, '0'))
  const words = `Rupees ${indian(rupees)}${paise ? ` and ${belowHundred(paise)} Paise` : ''} Only`
  return match[1] ? `Minus ${words}` : words
}
