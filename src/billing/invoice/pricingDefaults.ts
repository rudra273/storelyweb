import { GST_RATES } from '../../products/queries'
import type { InvoiceSettings } from '../queries'

export const PRICING_SETTING_KEYS = ['gst_scheme', 'default_gst_percent', 'default_profit_margin_percent', 'default_overhead_cost'] as const

function decimal(text: string, max: string, places: number) {
  const value = text.trim()
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(value)
  if (!match) return null
  const fractionText = match[3] ?? match[4] ?? ''
  const coefficient = ((match[2] ?? '') + fractionText).replace(/^0+/, '')
  if (!coefficient) return { whole: '0', fraction: '', canonical: '0' }
  if (match[1] === '-') return null
  const digits = coefficient.replace(/0+$/, '')
  const scale = BigInt(fractionText.length) - BigInt(match[5] ?? '0') - BigInt(coefficient.length - digits.length)
  if (scale > BigInt(places) || BigInt(digits.length) - scale > BigInt(max.length)) return null
  // Only bounded string positions become numbers; monetary values never do.
  const position = Number(scale)
  const whole = position <= 0 ? digits + '0'.repeat(-position) : digits.length > position ? digits.slice(0, -position) : '0'
  const fraction = position <= 0 ? '' : digits.length > position ? digits.slice(-position) : '0'.repeat(position - digits.length) + digits
  if (whole.length > max.length || (whole.length === max.length && (whole > max || (whole === max && fraction)))) return null
  return { whole, fraction, canonical: fraction ? `${whole}.${fraction}` : whole }
}

/** Mirror the write contract only. Untouched legacy values stay opaque decimal text. */
export function pricingSettingsProblems(base: InvoiceSettings, mine: InvoiceSettings): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const key of ['default_gst_percent', 'default_profit_margin_percent', 'default_overhead_cost'] as const) {
    if ((base[key] ?? '') === (mine[key] ?? '')) continue
    const max = key === 'default_overhead_cost' ? '999999999' : '100'
    const places = key === 'default_overhead_cost' ? 2 : 3
    const value = decimal(String(mine[key] ?? ''), max, places)
    if (key === 'default_gst_percent') {
      if (!value || !GST_RATES.includes(value.canonical)) errors[key] = 'Choose a supported GST rate: 0, 0.25, 3, 5, 12, 18, 28 or 40%.'
    } else {
      const valid = value !== null
      if (!valid) errors[key] = key === 'default_profit_margin_percent'
        ? 'Enter a margin from 0 to 100 with at most three decimal places.'
        : 'Enter an overhead cost from ₹0 to ₹999999999 with at most two decimal places.'
    }
  }
  return errors
}
