import { downloadFile } from '../../lib/download'
import type { Paper } from './InvoiceDocument'

/** INV/2627/0209 -> INV-2627-0209.pdf, the name the server gives the file too. */
export function pdfFileName(billNumber: string): string {
  return `${billNumber.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'invoice'}.pdf`
}

/** The server draws the PDF when asked and sends it straight back; nothing is stored. */
export function downloadInvoicePdf(shop: string, billId: string, billNumber: string, paper: Paper): Promise<void> {
  return downloadFile(`/v1/shops/${encodeURIComponent(shop)}/bills/${encodeURIComponent(billId)}/pdf?paper=${encodeURIComponent(paper)}`, pdfFileName(billNumber))
}
