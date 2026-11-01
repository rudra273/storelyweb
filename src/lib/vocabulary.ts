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
