import { request } from '../api/client'

/** Fetches a file through the normal signed-in request and hands it to the browser to save. */
export async function downloadFile(path: string, fileName: string): Promise<void> {
  const blob = await request<Blob>('GET', path, { as: 'blob' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** Saves rows already built from server figures as a CSV file. Nothing is calculated here. */
export function saveCsv(fileName: string, rows: (string | number | null)[][]): void {
  const cell = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const url = URL.createObjectURL(new Blob([rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
