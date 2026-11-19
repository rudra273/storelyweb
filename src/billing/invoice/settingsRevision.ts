import type { components } from '../../api/schema'
import { ApiError, api } from '../../api/client'
import type { InvoiceSettings } from '../queries'

type Change = components['schemas']['InvoiceSettingsIn']
export const SETTINGS_FIELDS = [
  ['shop_name', 'Shop name'], ['shop_address', 'Address'], ['shop_phone', 'Phone'], ['shop_email', 'Email'], ['shop_gstin', 'GSTIN'],
  ['gst_scheme', 'GST registration'], ['default_gst_percent', 'Default GST'], ['default_profit_margin_percent', 'Default margin'], ['default_overhead_cost', 'Default overhead'],
  ['invoice_title', 'Invoice title'], ['footer_text', 'Footer'], ['paper_size', 'Default paper'], ['upi_id', 'UPI ID'], ['terms_text', 'Terms'], ['bank_details', 'Bank details'],
  ['round_off_total', 'Round off total'], ['shop_logo', 'Shop logo'], ['digital_signature', 'Signature'],
] as const

export function requireSettingsRevision(value: InvoiceSettings): string {
  if (typeof value.revision !== 'string' || value.revision.length > 30 || !/^s1:\d+$/.test(value.revision)) throw new ApiError(409, 'unsupported_settings_contract', 'This server cannot confirm safe settings editing. Your changes are kept. Update or reconnect to a compatible Storely server before saving.')
  return value.revision
}

export async function assertSettingsRevisionSupport(shop: string): Promise<void> {
  let value: unknown
  try { value = await api.get<components['schemas']['CapabilitiesOut']>(`/v1/shops/${shop}/capabilities`) }
  catch (failure) {
    if (failure instanceof ApiError && failure.status === 404 && failure.code === 'http_404') throw new ApiError(409, 'unsupported_settings_contract', 'This server does not support guarded settings edits. Your changes are kept; update the Storely server before saving.')
    throw failure
  }
  const record = (data: unknown): data is Record<string, unknown> => !!data && typeof data === 'object' && !Array.isArray(data)
  if (!record(value) || value.contract_version !== 1 || value.shop_id !== shop || !['owner', 'admin', 'staff'].includes(String(value.role)) || !record(value.features) || value.features.settings_revision !== 1) {
    throw new ApiError(409, 'unsupported_settings_contract', 'This server cannot confirm safe settings editing. Your changes are kept. Update or reconnect to a compatible Storely server before saving.')
  }
}

/** Compare against the snapshot this editor opened or explicitly reviewed, never a live cache prop. */
export function settingsChanges(base: InvoiceSettings, mine: InvoiceSettings): Change {
  const out: Change = {}
  for (const [key] of SETTINGS_FIELDS) {
    if ((mine[key] ?? '') !== (base[key] ?? '')) Object.assign(out, { [key]: typeof mine[key] === 'string' ? mine[key].trim() || null : mine[key] })
  }
  const show = Object.fromEntries(Object.entries(mine.show).filter(([key, value]) => base.show[key] !== value))
  if (Object.keys(show).length) out.show = show
  return out
}

export function rebaseSettings(base: InvoiceSettings, mine: InvoiceSettings, latest: InvoiceSettings): InvoiceSettings {
  const merged = { ...latest, show: { ...latest.show } }
  for (const [key] of SETTINGS_FIELDS) if ((mine[key] ?? '') !== (base[key] ?? '')) Object.assign(merged, { [key]: mine[key] })
  for (const [key, value] of Object.entries(mine.show)) if (base.show[key] !== value) merged.show[key] = value
  return merged
}

export function settingsReview(base: InvoiceSettings, mine: InvoiceSettings, latest: InvoiceSettings) {
  const display = (key: string, value: unknown) => key === 'shop_logo' || key === 'digital_signature' ? value ? 'Image set' : 'No image' : typeof value === 'boolean' ? value ? 'On' : 'Off' : String(value ?? '') || 'None'
  const rows = SETTINGS_FIELDS.filter(([key]) => (mine[key] ?? '') !== (base[key] ?? '')).map(([key, label]) => ({ label: String(label), current: display(key, latest[key]), mine: display(key, mine[key]) }))
  for (const [key, value] of Object.entries(mine.show)) if (base.show[key] !== value) rows.push({ label: `Invoice visibility: ${key.replace(/^show_/, '').replace(/_/g, ' ')}`, current: latest.show[key] ? 'On' : 'Off', mine: value ? 'On' : 'Off' })
  return rows
}
