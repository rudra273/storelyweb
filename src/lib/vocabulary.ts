/**
 * Shared wording (refractor.md naming guide). Screens import these instead of retyping them,
 * so one concept never has two names. Internal API names need not match display text.
 */
export const ACTION = {
  /** Saving edits to something that already exists. A new record names the object instead (Add product, Record payment). */
  saveChanges: 'Save changes',
  /** Abandons uncommitted edits (the form asks first if there are any). */
  cancel: 'Cancel',
  /** Leaves a read-only view. */
  close: 'Close',
} as const

export const SALES = {
  newInvoice: 'New invoice',
  createInvoice: 'Create invoice',
  invoices: 'Invoices',
} as const

/** Payment states, the same in filters, badges, lists and detail. */
export const PAYMENT_STATUS: Record<string, string> = {
  paid: 'Paid',
  partial: 'Partially paid',
  unpaid: 'Unpaid',
  not_recorded: 'Not recorded',
  refunded: 'Refunded',
}

/**
 * The money words of a purchase, the same in the workspace, the receipt, the supplier statement and the list.
 * Decision: what goes into a product's cost (and so stock value and profit) is the items only. GST, other
 * charges and discount change what is owed to the supplier ("total payable"), not what each product cost.
 */
export const PURCHASE = {
  items: 'Items (stock cost)',
  gst: 'GST',
  charges: 'Other charges',
  discount: 'Discount',
  total: 'Total payable',
  paid: 'Paid',
  balance: 'Balance due',
  costRule: 'Only the items are added to what each product costs. GST, charges and discount change what you owe the supplier, not the cost of the stock.',
} as const
