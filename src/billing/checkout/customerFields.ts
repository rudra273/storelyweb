import type { Customer } from '../queries'

export const BLANK_CUSTOMER = { customer_name: '', customer_phone: '', customer_gstin: '', customer_gst_legal_name: '', customer_gst_trade_name: '', customer_address: '', place_of_supply_state_code: '' }
export type CustomerFields = typeof BLANK_CUSTOMER
export type BillType = 'b2c' | 'b2b'

export function fromCustomer(c: Customer): CustomerFields {
  return { customer_name: c.name, customer_phone: c.phone ?? '', customer_gstin: c.gstin ?? '', customer_gst_legal_name: c.gst_legal_name ?? '', customer_gst_trade_name: c.gst_trade_name ?? '', customer_address: c.address ?? '', place_of_supply_state_code: c.place_of_supply_state_code ?? '' }
}
