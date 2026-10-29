import type { NewReceiptProduct, ReceiptInput } from './contracts'

export interface DraftLine {
  id: string
  product_uuid: string
  name: string
  unit: string | null
  quantity: string
  unit_cost: string
  batch_no: string
  expiry_date: string
  new_product?: NewReceiptProduct
  import_key?: string
  import_row_number?: number
}
export interface PurchaseDraft {
  version: 1
  request_key: string
  purchase_date: string
  supplier_uuid: string
  invoice_number: string
  notes: string
  items: DraftLine[]
  // Freeze the actual request before sending. An uncertain response must be
  // resolved with exactly this payload, even after closing/reloading the app.
  submitted: ReceiptInput | null
  allow_duplicate_import_keys?: string[]
}
export function todayInShop(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)?.value).join('-')
}
export function draftKey(user: string, shop: string) {
  return `storely.purchase-draft.v1:${encodeURIComponent(user)}:${encodeURIComponent(shop)}`
}
export function newDraft(): PurchaseDraft {
  return { version: 1, request_key: crypto.randomUUID(), purchase_date: todayInShop(), supplier_uuid: '', invoice_number: '', notes: '', items: [], submitted: null }
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object'
const strings = (value: Record<string, unknown>, keys: string[]) => keys.every(key => typeof value[key] === 'string')
function validNewProduct(value: unknown): value is NewReceiptProduct {
  return object(value) && strings(value, ['client_key', 'name']) && ['product_code', 'barcode', 'selling_price', 'unit_name', 'category_name', 'hsn_code', 'gst_percent', 'reorder_level', 'mrp_price'].every(key => value[key] === undefined || value[key] === null || typeof value[key] === 'string')
}
function validInput(value: unknown): value is ReceiptInput {
  return object(value) && strings(value, ['request_key', 'purchase_date']) &&
    ['supplier_uuid', 'invoice_number', 'notes'].every(key => value[key] === null || typeof value[key] === 'string') &&
    Array.isArray(value.items) && value.items.length > 0 && value.items.length <= 200 && value.items.every(line => object(line) && strings(line, ['quantity', 'unit_cost']) && (typeof line.product_uuid === 'string' || line.product_uuid === null && validNewProduct(line.new_product)) && ['batch_no', 'expiry_date'].every(key => line[key] === null || typeof line[key] === 'string'))
}
export function readDraft(key: string): { draft: PurchaseDraft; error: string | null; serialized: string | null } {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { draft: newDraft(), error: null, serialized: null }
    const d: unknown = JSON.parse(raw)
    if (!object(d) || d.version !== 1 || !strings(d, ['request_key', 'purchase_date', 'supplier_uuid', 'invoice_number', 'notes']) || !Array.isArray(d.items) || d.items.length > 200 || !d.items.every(line => object(line) && strings(line, ['id', 'product_uuid', 'name', 'quantity', 'unit_cost', 'batch_no', 'expiry_date']) && (line.unit === null || typeof line.unit === 'string') && (line.new_product === undefined || validNewProduct(line.new_product)) && (line.import_key === undefined || typeof line.import_key === 'string')) || (d.submitted !== null && !validInput(d.submitted))) throw new Error('invalid draft')
    if (d.allow_duplicate_import_keys !== undefined && (!Array.isArray(d.allow_duplicate_import_keys) || !d.allow_duplicate_import_keys.every(key => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key)))) throw new Error('invalid import acknowledgements')
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(String(d.request_key))) throw new Error('invalid request key')
    if (d.submitted && (d.submitted as ReceiptInput).request_key !== d.request_key) throw new Error('invalid retry key')
    return { draft: d as unknown as PurchaseDraft, error: null, serialized: raw }
  } catch {
    return { draft: newDraft(), error: 'The saved purchase draft could not be read. Resolve or discard it before saving a purchase.', serialized: null }
  }
}
const scaled = (value: string): bigint | null => {
  if (!/^\d{1,10}(\.\d{1,4})?$/.test(value.trim())) return null
  const [whole = '0', fraction = ''] = value.trim().split('.')
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'))
}
export function amountInCents(quantity: string, cost: string): bigint | null {
  const q = scaled(quantity), c = scaled(cost)
  return q === null || c === null || q <= 0n ? null : (q * c + 500000n) / 1000000n
}
export function centsText(cents: bigint): string {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`
}
export function subtotal(draft: PurchaseDraft): string | null {
  let total = 0n
  for (const line of draft.items) {
    const amount = amountInCents(line.quantity, line.unit_cost)
    if (amount === null) return null
    total += amount
  }
  return centsText(total)
}
export function validDate(value: string): boolean {
  return value >= '0001-01-01' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
export function draftError(draft: PurchaseDraft): string | null {
  if (!validDate(draft.purchase_date) || draft.purchase_date > todayInShop()) return 'Choose a valid receipt date up to today.'
  if (new Set(draft.items.flatMap(line => line.import_key ? [line.import_key] : [])).size > 20) return 'A purchase supports up to 20 source files.'
  if (!draft.items.length) return 'Add at least one product.'
  for (const [index, line] of draft.items.entries()) {
    if (amountInCents(line.quantity, line.unit_cost) === null) return `Item ${index + 1}: enter a positive quantity and a non-negative unit cost with up to four decimal places.`
    if (line.expiry_date && !validDate(line.expiry_date)) return `Item ${index + 1}: choose a valid expiry date.`
  }
  for (const value of draft.items.filter(item => item.new_product).map(item => item.new_product!)) {
    if (!value.name.trim() || value.name.length > 200) return 'New products need a name up to 200 characters.'
    for (const field of ['selling_price', 'reorder_level', 'mrp_price'] as const) {
      if (value[field] != null && amountInCents('1', value[field]!) === null) return 'Check the new product prices and reorder level.'
    }
  }
  return null
}
export function toInput(draft: PurchaseDraft): ReceiptInput {
  return {
    request_key: draft.request_key, purchase_date: draft.purchase_date,
    supplier_uuid: draft.supplier_uuid || null, invoice_number: draft.invoice_number.trim() || null, notes: draft.notes.trim() || null,
    ...(draft.items.some(line => line.import_key) ? { import_keys: [...new Set(draft.items.flatMap(line => line.import_key ? [line.import_key] : []))].sort(), allow_duplicate_import_keys: draft.allow_duplicate_import_keys?.filter(key => draft.items.some(line => line.import_key === key)) ?? [] } : {}),
    items: draft.items.map(line => ({ product_uuid: line.new_product ? null : line.product_uuid, ...(line.new_product ? { new_product: line.new_product } : {}), ...(line.import_key ? { import_key: line.import_key, import_row_number: line.import_row_number } : {}), quantity: line.quantity.trim(), unit_cost: line.unit_cost.trim(), batch_no: line.batch_no.trim() || null, expiry_date: line.expiry_date || null })),
  }
}
