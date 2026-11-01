/** The checks the phone app and the API make on what people type, so a form can say what is
 * wrong next to the field before anything is sent. The server checks again; these only help. */

const digits = (text: string) => text.replace(/\D/g, '')

/** A mobile number: 10 digits, optionally with 91 or 0 in front (as the phone accepts). */
export function phoneProblem(text: string, required = false): string | null {
  const d = digits(text)
  if (!d) return required ? 'Enter a phone number.' : null
  if (d.length < 10 || d.length > 12) return 'Enter a 10-digit mobile number.'
  return null
}

export function emailProblem(text: string): string | null {
  const v = text.trim()
  if (!v) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Enter an email like name@example.com.'
}

/** 15 letters and digits starting with the two-digit state code (the API's own rule). */
export function gstinProblem(text: string): string | null {
  const v = text.trim().toUpperCase()
  if (!v) return null
  if (v.length !== 15) return `A GSTIN has 15 characters (you entered ${v.length}).`
  if (!/^\d{2}[A-Z0-9]{13}$/.test(v)) return 'This GSTIN is not in the right format, like 27ABCDE1234F1Z5.'
  return null
}

/** An amount in rupees with at most two decimals, within [min, max]. */
export function amountProblem(text: string, { min = 0.01, max, label = 'an amount' }: { min?: number; max?: number; label?: string } = {}): string | null {
  const v = text.trim()
  if (!v) return `Enter ${label}.`
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(v)) return 'Use a number with up to two decimals, like 250 or 99.50.'
  const n = Number(v)
  if (n < min) return min === 0.01 ? 'Enter an amount above zero.' : `Enter at least ₹${min}.`
  if (max !== undefined && n > max + 0.005) return `This is more than the ₹${max.toFixed(2)} due.`
  return null
}

/** "919876543210" → "+91 98765 43210"; anything else is shown as stored. */
export function phoneLabel(stored: string | null | undefined): string {
  if (!stored) return '—'
  const d = digits(stored)
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`
  return stored
}

/** The shop's calendar day today, as yyyy-mm-dd (for date pickers' max). */
export function todayIso(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** A shop's own number may be a landline with its STD code (up to 13 digits). */
export function shopPhoneProblem(text: string): string | null {
  const d = digits(text)
  if (!d) return null
  return d.length < 10 || d.length > 13 ? 'Enter a phone number with 10 digits, or a landline with its STD code.' : null
}

export function upiProblem(text: string): string | null {
  const v = text.trim()
  if (!v) return null
  return /^[A-Za-z0-9._-]{2,256}@[A-Za-z]{2,64}$/.test(v) ? null : 'A UPI id looks like shopname@okaxis.'
}
