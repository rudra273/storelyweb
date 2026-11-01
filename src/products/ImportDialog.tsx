import { useRef, useState } from 'react'
import { Modal } from '../components/Modal'
import { Alert } from '../components/ui'
import { useAction } from '../components/useAction'
import { ApiError } from '../api/client'
import { importFile, useProductMutation, type ImportReport } from './queries'

const SAMPLE = 'product_name,quantity,purchase_price,selling_price,mrp_price,unit,category,gst_percent,hsn_code,barcode,product_code,reorder_level\r\nParle-G Biscuit 100 g,48,8,10,10,pcs,Biscuits,18,1905,8901719101038,PG100,12\r\nBasmati Rice 1 kg,20,92,110,120,pkt,Grains,5,1006,,RICE1,5\r\n'

function downloadSample() {
  const url = URL.createObjectURL(new Blob([SAMPLE], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'storely-products-sample.csv'
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** Pick a file, see exactly what would happen, then confirm. Nothing changes before the second step. */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const run = useProductMutation((s: string, input: { file: File; dryRun: boolean; allowDuplicate: boolean }) => importFile(s, input.file, input))
  const { busy, error, run: act } = useAction()
  const pending = useRef(false)
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [done, setDone] = useState<ImportReport | null>(null)
  const [duplicate, setDuplicate] = useState(false)

  async function preview(chosen: File) {
    if (pending.current) return
    pending.current = true
    setFile(chosen)
    setReport(null)
    setDone(null)
    setDuplicate(false)
    const out = await act(() => run.mutateAsync({ file: chosen, dryRun: true, allowDuplicate: false }))
    if (out) setReport(out)
    pending.current = false
  }

  async function confirm() {
    if (!file || pending.current) return
    pending.current = true
    try {
      const out = await act(async () => {
        try {
          return await run.mutateAsync({ file, dryRun: false, allowDuplicate: duplicate })
        } catch (e) {
          if (e instanceof ApiError && e.code === 'duplicate_import') setDuplicate(true)
          throw e
        }
      })
      if (out) {
        setDone(out)
        setReport(null)
      }
    } finally {
      pending.current = false
    }
  }

  const importable = report ? report.added + report.updated : 0
  return (
    <Modal title="Import products" onClose={onClose} canClose={!busy} wide>
      {!done && (
        <>
          <p>Each row is one product. Every row needs a <strong>name</strong>, the <strong>quantity</strong> you have and its <strong>cost price</strong>. You can also give selling price, MRP, unit, category, GST %, HSN code, barcode, product code and reorder level.</p>
          <p className="muted">Column names like name, qty, cost or sku are understood too. Start from the sample to see the layout. <button type="button" className="link" onClick={downloadSample}>Download sample file (CSV)</button></p>
          <div className="field">
            <label htmlFor="import-file">CSV or Excel (.xlsx) file, up to 5 MB</label>
            <input id="import-file" type="file" disabled={busy} accept=".csv,.xlsx,text/csv" onChange={(e) => e.target.files?.[0] && void preview(e.target.files[0])} />
          </div>
        </>
      )}
      {error && <Alert>{error}</Alert>}
      {busy && <p role="status">{report ? 'Importing products…' : 'Checking the file…'}</p>}
      {report && (
        <div>
          <Alert kind="info">
            {report.added} new, {report.updated} existing will get stock added, {report.skipped} row{report.skipped === 1 ? '' : 's'} skipped. Nothing has changed yet.
          </Alert>
          {report.possible_duplicate && <Alert>This exact file was already imported today. Importing it again adds the stock twice.</Alert>}
          {report.errors.length > 0 && (
            <table className="table">
              <thead>
                <tr><th>Row</th><th>Problem</th></tr>
              </thead>
              <tbody>
                {report.errors.map((r) => (
                  <tr key={r.row}><td>{r.row}</td><td>{r.message}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {report.more_errors > 0 && <p className="muted">…and {report.more_errors} more.</p>}
          <div className="actions">
            <button className="primary" disabled={busy || importable === 0} onClick={confirm}>
              {busy ? 'Importing…' : duplicate ? 'Import again anyway' : `Import ${importable} product${importable === 1 ? '' : 's'}`}
            </button>
            <button disabled={busy} onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}
      {done && (
        <div>
          <Alert kind="success">
            Imported: {done.added} added, {done.updated} updated{done.skipped ? `, ${done.skipped} skipped` : ''}. Phones receive this on their next sync.
          </Alert>
          <button className="primary" onClick={onClose}>Done</button>
        </div>
      )}
    </Modal>
  )
}
