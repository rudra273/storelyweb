import { request } from '../../api/client'
import { downloadFile } from '../../lib/download'
import type { Paper } from './InvoiceDocument'

/** INV/2627/0209 -> INV-2627-0209.pdf, the name the server gives the file too. */
export function pdfFileName(billNumber: string): string {
  return `${billNumber.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'invoice'}.pdf`
}

/** Whether the browser supports native Web Share with PDF files. */
export function canSharePdfFile(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    return false
  }
  try {
    return navigator.canShare({ files: [new File([''], 'invoice.pdf', { type: 'application/pdf' })] })
  } catch {
    return false
  }
}

/** The server draws the PDF when asked and sends it straight back; nothing is stored. */
export function downloadInvoicePdf(shop: string, billId: string, billNumber: string, paper: Paper): Promise<void> {
  return downloadFile(`/v1/shops/${encodeURIComponent(shop)}/bills/${encodeURIComponent(billId)}/pdf?paper=${encodeURIComponent(paper)}`, pdfFileName(billNumber))
}

/** Fetches the server PDF and hands it to the browser's native Share sheet. */
export async function shareInvoicePdf(shop: string, billId: string, billNumber: string, paper: Paper): Promise<void> {
  const path = `/v1/shops/${encodeURIComponent(shop)}/bills/${encodeURIComponent(billId)}/pdf?paper=${encodeURIComponent(paper)}`
  const blob = await request<Blob>('GET', path, { as: 'blob' })
  const file = new File([blob], pdfFileName(billNumber), { type: 'application/pdf' })
  try {
    await navigator.share({ title: `Invoice ${billNumber}`, files: [file] })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    throw err
  }
}
