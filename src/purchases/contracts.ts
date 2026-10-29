// Stock receipt API contracts. Money and quantities travel as decimal strings.
export interface ReceiptItemInput {
  product_uuid: string
  quantity: string
  unit_cost: string
  batch_no: string | null
  expiry_date: string | null
}
export interface ReceiptInput {
  request_key: string
  purchase_date: string
  supplier_uuid: string | null
  invoice_number: string | null
  notes: string | null
  items: ReceiptItemInput[]
}
export interface ReceiptLine extends ReceiptItemInput {
  uuid: string
  product_name: string
  unit_name: string | null
  amount: string
  movement_uuid: string
  line_number: number
}
export interface Receipt {
  uuid: string
  supplier_uuid: string | null
  supplier_name: string | null
  purchase_date: string
  invoice_number: string | null
  notes: string | null
  subtotal: string
  payment_status: 'not_recorded'
  created_at: string
  items: ReceiptLine[]
}
