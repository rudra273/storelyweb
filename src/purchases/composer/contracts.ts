import type { components } from '../../api/schema'
// Stock receipt API contracts. Money and quantities travel as decimal strings.
export interface NewReceiptProduct {
  client_key: string
  name: string
  product_code?: string | null
  barcode?: string | null
  selling_price?: string | null
  unit_name?: string | null
  category_name?: string | null
  hsn_code?: string | null
  gst_percent?: string | null
  reorder_level?: string | null
  mrp_price?: string | null
}
export interface ReceiptItemInput {
  product_uuid: string | null
  new_product?: NewReceiptProduct | null
  import_key?: string | null
  import_row_number?: number | null
  quantity: string
  unit_cost: string
  batch_no: string | null
  expiry_date: string | null
}
export interface ReceiptInput extends Partial<Pick<components['schemas']['ReceiptIn'], 'tax_amount' | 'charges_amount' | 'discount_amount' | 'record_payment_terms' | 'due_date' | 'paid_now' | 'paid_in_full' | 'payment_method'>> {
  request_key: string
  purchase_date: string
  supplier_uuid: string | null
  invoice_number: string | null
  notes: string | null
  items: ReceiptItemInput[]
  import_keys?: string[]
  allow_duplicate_import_keys?: string[]
}
export interface ReceiptLine extends ReceiptItemInput {
  product_uuid: string
  uuid: string
  product_name: string
  unit_name: string | null
  amount: string
  movement_uuid: string
  line_number: number
  returned_quantity?: string
  returnable_quantity?: string
}
export interface Receipt extends Partial<Pick<components['schemas']['ReceiptOut'], 'tax_amount' | 'charges_amount' | 'discount_amount' | 'total' | 'due_date' | 'paid_amount' | 'balance_due' | 'payments' | 'reversed_at' | 'reversal_reason' | 'returned_total' | 'returns'>> {
  uuid: string
  supplier_uuid: string | null
  supplier_name: string | null
  purchase_date: string
  invoice_number: string | null
  notes: string | null
  subtotal: string
  payment_status: 'not_recorded' | 'unpaid' | 'partial' | 'paid'
  created_at: string
  items: ReceiptLine[]
}

export interface ImportCandidate { uuid: string; name: string; unit_name: string | null; unit_compatible?: boolean }
export interface ImportPreviewRow { number: number; name: string; item: ReceiptItemInput | null; candidates: ImportCandidate[]; requires_choice: boolean; identifier_conflict?: boolean; error: string | null }
export interface ImportPreview { fingerprint: string; possible_duplicate: boolean; rows: ImportPreviewRow[]; warnings: string[] }
