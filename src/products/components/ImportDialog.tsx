import { useRef, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Alert } from '../../components/ui/ui'
import { useAction } from '../../components/useAction'
import { ApiError } from '../../api/client'
import { day } from '../../components/labels'
import { importFile, useProductMutation, type ImportReport } from '../queries'

const SHOWN_PROBLEMS = 8

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
  const run = useProductMutation((s: string, input: { file: File; dryRun: boolean; allowDuplicate: boolean; stopOnErrors?: boolean }) => importFile(s, input.file, input))
  const { busy, error, run: act } = useAction()
  const pending = useRef(false)
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [done, setDone] = useState<ImportReport | null>(null)
  const [duplicate, setDuplicate] = useState(false)
  // Rows with problems are only skipped if that is chosen; otherwise a file with any problem imports nothing.
  const [skipBad, setSkipBad] = useState(false)

  async function preview(chosen: File) {
    if (pending.current) return
    pending.current = true
    setFile(chosen)
    setReport(null)
    setDone(null)
    setDuplicate(false)
    setSkipBad(false)
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
          return await run.mutateAsync({ file, dryRun: false, allowDuplicate: duplicate, stopOnErrors: !skipBad })
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
  const problems = report?.skipped ?? 0
  // A file with problem rows waits for a decision: fix it, or knowingly skip those rows.
  const blocked = problems > 0 && !skipBad
  function downloadProblems() {
    if (!report) return
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const rows = ['Row in your file,Problem', ...report.errors.map(e => `${cell(e.row)},${cell(e.message)}`)]
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'rows-with-problems.csv'
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }
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
      {/* A repeat that the review already warned about is not said twice. */}
      {error && !(duplicate && report?.possible_duplicate) && <Alert>{error}</Alert>}
      {busy && <p role="status">{report ? 'Importing products…' : 'Checking the file…'}</p>}
      {report && (
        <div>
          <Alert kind="info">
            {report.added} new, {report.updated} existing will get stock added, {report.skipped} row{report.skipped === 1 ? '' : 's'} skipped. Nothing has changed yet.
          </Alert>
          {report.possible_duplicate && <Alert>This exact file was already imported{report.previous_import_at ? ` on ${day(report.previous_import_at)}` : ''}. Importing it again adds the stock again. If that earlier import was interrupted, check the products first.</Alert>}
          {report.errors.length > 0 && (
            <>
              <table className="table import-problems">
                <caption>{problems} row{problems === 1 ? ' has' : 's have'} a problem</caption>
                <thead>
                  <tr><th>Row</th><th>Problem</th></tr>
                </thead>
                <tbody>
                  {report.errors.slice(0, SHOWN_PROBLEMS).map((r) => (
                    <tr key={r.row}><td>{r.row}</td><td>{r.message}</td></tr>
                  ))}
                </tbody>
              </table>
              {report.errors.length > SHOWN_PROBLEMS && <p className="muted">…and {(report.errors.length - SHOWN_PROBLEMS + report.more_errors).toLocaleString('en-IN')} more.</p>}
              <button type="button" className="link" onClick={downloadProblems}>Download the list of problems (CSV)</button>
              <label className="check import-skip">
                <input type="checkbox" checked={skipBad} onChange={(e) => setSkipBad(e.target.checked)} />
                Import the {importable} good row{importable === 1 ? '' : 's'} and skip the {problems} with problems
              </label>
              <p className="muted hint">{skipBad
                ? 'Skipped rows are not imported. When you import them later, send only the corrected rows: sending the whole file again would add the stock of the good rows twice.'
                : 'Nothing is imported while any row has a problem. Fix the file and choose it again, or tick the box above to skip those rows.'}</p>
            </>
          )}
          <div className="actions">
            <button className="primary" disabled={busy || importable === 0 || blocked} onClick={confirm}>
              {busy ? 'Importing…' : duplicate ? 'Import again anyway' : blocked ? 'Fix the problems first' : `Import ${importable} product${importable === 1 ? '' : 's'}${problems ? ` and skip ${problems} row${problems === 1 ? '' : 's'}` : ''}`}
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
