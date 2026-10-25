import { useState } from 'react'
import { Modal } from '../components/Modal'
import { Alert } from '../components/ui'
import { useAction } from '../components/useAction'
import { ApiError } from '../api/client'
import { importFile, useProductMutation, type ImportReport } from './queries'

const GUIDE = 'Needs the columns product_name, quantity and purchase_price. Optional: product_code, barcode, category, selling_price, unit, hsn_code, gst_percent, reorder_level, mrp_price. Other common spellings (name, qty, cost, sku, …) are understood.'

/** Pick a file, see exactly what would happen, then confirm. Nothing changes before the second step. */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const run = useProductMutation((s: string, input: { file: File; dryRun: boolean; allowDuplicate: boolean }) => importFile(s, input.file, input))
  const { busy, error, run: act, setError } = useAction()
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [done, setDone] = useState<ImportReport | null>(null)
  const [duplicate, setDuplicate] = useState(false)

  async function preview(chosen: File) {
    setFile(chosen)
    setReport(null)
    setDone(null)
    setDuplicate(false)
    const out = await act(() => run.mutateAsync({ file: chosen, dryRun: true, allowDuplicate: false }))
    if (out) setReport(out)
  }

  async function confirm() {
    if (!file) return
    try {
      const out = await run.mutateAsync({ file, dryRun: false, allowDuplicate: duplicate })
      setDone(out)
      setReport(null)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'duplicate_import') setDuplicate(true)
      setError(e instanceof ApiError ? e.message : 'The import failed. Nothing was changed.')
    }
  }

  const importable = report ? report.added + report.updated : 0
  return (
    <Modal title="Import products" onClose={onClose} wide>
      {!done && (
        <>
          <p className="muted">{GUIDE}</p>
          <div className="field">
            <label htmlFor="import-file">CSV or Excel (.xlsx) file, up to 5 MB</label>
            <input id="import-file" type="file" accept=".csv,.xlsx,text/csv" onChange={(e) => e.target.files?.[0] && void preview(e.target.files[0])} />
          </div>
        </>
      )}
      {error && <Alert>{error}</Alert>}
      {busy && <p role="status">Checking the file…</p>}
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
              {duplicate ? 'Import again anyway' : `Import ${importable} product${importable === 1 ? '' : 's'}`}
            </button>
            <button onClick={onClose}>Cancel</button>
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
