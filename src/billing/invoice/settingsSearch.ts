/** Search only public setting labels and task aliases, never saved shop values. */
export const SETTINGS_SEARCH = [
  { id: 'identity', tab: 'shop', label: 'Shop details', aliases: 'shop name address phone email GSTIN business identity contact' },
  { id: 'stock', tab: 'shop', label: 'Stock alerts', aliases: 'default low-stock threshold reorder inventory warning' },
  { id: 'images', tab: 'shop', label: 'Logo and signature', aliases: 'shop logo picture digital signature image' },
  { id: 'tax', tab: 'pricing', label: 'Tax and pricing defaults', aliases: 'GST scheme registration regular composition unregistered default rate profit margin overhead round totals round off rupee' },
  { id: 'invoice', tab: 'invoice', label: 'Invoice appearance', aliases: 'invoice layout title UPI id QR terms bank details footer payment' },
  { id: 'visibility', tab: 'invoice', label: 'What the invoice shows', aliases: 'visibility columns HSN SAC quantity rate GST amount customer subtotal discount totals logo signature hide show' },
  { id: 'printing', tab: 'printing', label: 'Printing', aliases: 'printer paper size default paper A4 A5 receipt roll thermal 58mm 80mm PDF print layout' },
] as const
export type SettingsSearchEntry = (typeof SETTINGS_SEARCH)[number]
export function findSettings(text: string): SettingsSearchEntry[] {
  const query = text.trim().toLowerCase()
  return query ? SETTINGS_SEARCH.filter(entry => `${entry.label} ${entry.aliases}`.toLowerCase().includes(query)) : []
}
