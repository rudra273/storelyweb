import type { components } from '../api/schema'
import { ApiError, api } from '../api/client'

/** Feature support is negotiated independently of the server's role/tenant checks. */
export async function assertProductEditSupport(shop: string): Promise<void> {
  let value: unknown
  try { value = await api.get<components['schemas']['CapabilitiesOut']>(`/v1/shops/${shop}/capabilities`) }
  catch (error) {
    // A missing route cannot prove that timestamp comparisons are atomic.
    if (error instanceof ApiError && error.status === 404 && error.code === 'http_404') {
      throw new ApiError(409, 'unsupported_edit_contract', 'This server cannot confirm safe product editing. Your changes are kept. Update or reconnect to a compatible Storely server before saving.')
    }
    throw error
  }
  const record = (data: unknown): data is Record<string, unknown> => !!data && typeof data === 'object' && !Array.isArray(data)
  if (!record(value) || value.contract_version !== 1 || value.shop_id !== shop || !['owner', 'admin', 'staff'].includes(String(value.role)) || !record(value.features) || value.features.product_expected_updated_at !== 1 || value.features.operation_lookup !== 1 || value.features.supplier_payment_proof !== 1 || value.features.supplier_payment_binding !== 2) {
    throw new ApiError(409, 'unsupported_edit_contract', 'This server cannot confirm safe product editing. Your changes are kept. Update or reconnect to a compatible Storely server before saving.')
  }
}

export function rebaseEditedFields<T extends Record<string, string | boolean>>(base: T, mine: T, latest: T): T {
  const result = { ...latest }
  for (const key of Object.keys(mine) as (keyof T)[]) if (mine[key] !== base[key]) result[key] = mine[key]
  return result
}

export function changedFields<T extends Record<string, string | boolean>>(base: T, mine: T, latest: T, labels: Partial<Record<keyof T, string>>, format?: (key: keyof T, value: T[keyof T]) => string) {
  return (Object.keys(mine) as (keyof T)[]).filter(key => mine[key] !== base[key]).map(key => ({
    label: labels[key] ?? String(key),
    current: format ? format(key, latest[key]) : typeof latest[key] === 'boolean' ? (latest[key] ? 'Yes' : 'No') : latest[key] || 'None',
    mine: format ? format(key, mine[key]) : typeof mine[key] === 'boolean' ? (mine[key] ? 'Yes' : 'No') : mine[key] || 'None',
  }))
}
