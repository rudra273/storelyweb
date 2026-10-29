import { useRef, useState } from 'react'
import { Modal } from '../components/Modal'
import { Alert, Field } from '../components/ui'
import { Button } from '../components/workspace'
import { useShop } from '../shops/context'
import { describeError } from '../components/useAction'
import { previewPurchaseImport } from './queries'
import { type DraftLine } from './draft'
import type { ImportPreview, ImportPreviewRow, ReceiptItemInput } from './contracts'

export function PurchaseImport({ existingKeys, available, onClose, onStage }: { existingKeys: string[]; available: number; onClose: () => void; onStage: (lines: DraftLine[], allowDuplicate: boolean) => void }) {
  const shop = useShop().current?.shop_id ?? ''
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [choices, setChoices] = useState<Record<number, string>>({})
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const reading = useRef(false)
  async function read(file: File) {
    if (reading.current) return
    setError(null); setPreview(null); setChoices({}); setExcluded(new Set()); setAllowDuplicate(false)
    if (file.size > 5 * 1024 * 1024) { setError('Choose a file up to 5 MB.'); return }
    reading.current = true; setBusy(true)
    try { setPreview(await previewPurchaseImport(shop, file)) }
    catch (failure) { setError(describeError(failure)) }
    finally { reading.current = false; setBusy(false) }
  }
  function resolved(row: ImportPreviewRow): ReceiptItemInput | null {
    if (!row.item || row.error) return null
    const choice = choices[row.number]
    if (row.requires_choice && !choice) return null
    if (!choice || choice === 'new') return row.item
    if (!row.candidates.some(candidate => candidate.uuid === choice && candidate.unit_compatible !== false)) return null
    return { ...row.item, product_uuid: choice, new_product: undefined }
  }
  const included = preview?.rows.filter(row => !excluded.has(row.number)) ?? []
  const duplicate = !!preview && (preview.possible_duplicate || existingKeys.includes(preview.fingerprint))
  const tooManyFiles = !!preview && !existingKeys.includes(preview.fingerprint) && new Set(existingKeys).size >= 20
  const unresolved = included.some(row => !resolved(row))
  function stage() {
    if (!preview || busy || tooManyFiles || unresolved || !included.length || included.length > available || duplicate && !allowDuplicate) return
    const lines = included.map(row => {
      const item = resolved(row)!
      const candidate = row.candidates.find(c => c.uuid === item.product_uuid)
      return { id: crypto.randomUUID(), product_uuid: item.product_uuid ?? '', name: candidate?.name ?? item.new_product?.name ?? row.name, unit: candidate?.unit_name ?? item.new_product?.unit_name ?? null, quantity: item.quantity, unit_cost: item.unit_cost, batch_no: item.batch_no ?? '', expiry_date: item.expiry_date ?? '', ...(item.new_product ? { new_product: item.new_product } : {}), import_key: preview.fingerprint, import_row_number: row.number }
    })
    onStage(lines, allowDuplicate)
  }
  return <Modal title="Import purchase items" onClose={() => { if (!reading.current) onClose() }} canClose={!busy} wide>
    <p>CSV or .xlsx, up to 5 MB and 200 rows. Required columns: product_name, quantity, purchase_price. Optional: product_code, barcode, selling_price, unit, category, hsn_code, gst_percent, reorder_level, mrp_price, batch_no, expiry_date.</p>
    <p className="muted">Preview creates no products or stock. Resolve name matches and fix the file or explicitly exclude invalid rows. After staging, quantities, costs and new-product details remain editable before saving the purchase.</p>
    <Field label="Purchase CSV or Excel file" type="file" accept=".csv,.xlsx" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void read(file) }} />
    {busy && <p role="status">Reading purchase file…</p>}{error && <Alert>{error}</Alert>}
    {preview && <>
      {preview.warnings.map(warning => <p className="muted" key={warning}>{warning}</p>)}
      {duplicate && <Alert>This file was already used or is already staged. Adding it again increases stock again.</Alert>}
      {duplicate && <label className="check"><input type="checkbox" checked={allowDuplicate} onChange={e => setAllowDuplicate(e.target.checked)} />I intend to add these quantities again</label>}
      <ol className="plain purchase-lines">{preview.rows.map(row => <li key={row.number} className="purchase-line"><strong>Row {row.number}: {row.name}</strong>
        {row.error ? <Alert>{row.error}</Alert> : <p>Quantity {row.item?.quantity} · unit cost ₹{row.item?.unit_cost} {row.item?.batch_no && `· batch ${row.item.batch_no}`}</p>}
        {row.requires_choice ? <div className="field"><label htmlFor={`import-match-${row.number}`}>Match row {row.number}</label><select id={`import-match-${row.number}`} value={choices[row.number] ?? ''} disabled={excluded.has(row.number)} onChange={e => setChoices({ ...choices, [row.number]: e.target.value })}><option value="">Choose which product</option>{row.candidates.map(c => <option key={c.uuid} value={c.uuid} disabled={c.unit_compatible === false}>{c.name}{c.unit_name ? ` (${c.unit_name})` : ''}</option>)}{!row.identifier_conflict && <option value="new">Create a distinct new product</option>}</select></div> : row.item && <p className="muted">{row.item.product_uuid ? `Restock: ${row.candidates.find(c => c.uuid === row.item?.product_uuid)?.name ?? row.name}` : 'New product (staged only)'}</p>}
        <label className="check"><input type="checkbox" checked={excluded.has(row.number)} onChange={e => setExcluded(previous => { const next = new Set(previous); if (e.target.checked) next.add(row.number); else next.delete(row.number); return next })} />Exclude row {row.number}</label>
      </li>)}</ol>
      {tooManyFiles && <Alert>A purchase supports up to 20 source files. Save this purchase before importing another file.</Alert>}
      {included.length > available && <Alert>This draft has room for {available} more rows. Exclude rows or split the purchase.</Alert>}
      {unresolved && <p role="status">Resolve matches, or fix/exclude invalid rows before staging.</p>}
      <Button variant="primary" disabled={busy || tooManyFiles || unresolved || !included.length || included.length > available || duplicate && !allowDuplicate} onClick={stage}>Stage {included.length} purchase items</Button>
    </>}
  </Modal>
}
