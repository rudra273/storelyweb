import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { day, paymentStatus } from '../components/labels'
import { Alert, Empty, Loading } from '../components/ui/ui'
import { Button, PageHeader } from '../components/ui/workspace'
import { can } from '../permissions'
import { useShop } from '../shops/context'
import { PurchaseComposer } from './composer/PurchaseComposer'
import { receiptMoney } from './composer/money'
import type { Receipt } from './composer/contracts'
import { PurchaseDetail } from './PurchaseDetail'
import { RECEIPT_PAGE_SIZE, useReceipts } from './queries'

/** Stock received from suppliers: what came in, from whom, and whether it is paid for. */
export function PurchaseInvoicesPage() {
  const { current, role } = useShop()
  const canRecord = can(role, 'products.edit')
  const [params, setParams] = useSearchParams()
  const page = Math.max(0, Number(params.get('page')) || 0)
  const [recording, setRecording] = useState(false)
  const [selected, setSelected] = useState<Receipt | null>(null)
  const receipts = useReceipts(page)
  const goTo = (next: number) => setParams(next > 0 ? { page: String(next) } : {}, { replace: false })
  const rows = receipts.data ?? []

  return <div className="purchases-page">
    <PageHeader eyebrow="PURCHASES" title="Purchase invoices" description={`Stock received from suppliers at ${current?.name ?? 'your shop'}, and what is still owed.`} actions={<>
      {canRecord && <Button variant="primary" onClick={() => setRecording(true)}>Record purchase</Button>}
      <Link className="button secondary" to="/suppliers">Suppliers</Link>
    </>} />
    {receipts.isPending && <Loading label="Loading purchases…" />}
    {receipts.error && <Alert>Purchases could not be loaded. <button className="link" onClick={() => void receipts.refetch()}>Retry</button></Alert>}
    {receipts.data && rows.length === 0 && (page > 0
      ? <Empty title="No purchases on this page"><Button onClick={() => goTo(page - 1)}>Previous page</Button></Empty>
      : <Empty title="No purchases recorded yet">Record stock you receive from a supplier to keep stock and what you owe accurate.{canRecord && <div className="actions empty-actions"><Button variant="primary" onClick={() => setRecording(true)}>Record purchase</Button></div>}</Empty>)}
    {rows.length > 0 && <div className="table-wrap"><table className="table">
      <thead><tr><th>Date</th><th>Supplier</th><th>Supplier invoice</th><th className="num">Total</th><th>Payment</th><th className="num">Balance due</th><th><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.uuid}>
        <td>{day(r.purchase_date)}</td>
        <td>{r.supplier_name ?? <span className="muted">No supplier</span>}</td>
        <td>{r.invoice_number ?? <span className="muted">—</span>}</td>
        <td className="num">{receiptMoney(r.total ?? r.subtotal)}</td>
        <td>{paymentStatus(r.payment_status)}</td>
        <td className="num">{r.balance_due == null ? <span className="muted">—</span> : receiptMoney(r.balance_due)}</td>
        <td className="row-actions"><button className="link" aria-label={`View purchase ${r.invoice_number ?? r.purchase_date}`} onClick={() => setSelected(r)}>View</button></td>
      </tr>)}</tbody>
    </table></div>}
    {(page > 0 || rows.length === RECEIPT_PAGE_SIZE) && <div className="pager">
      <span className="muted">Page {page + 1}</span>
      <Button disabled={page === 0 || receipts.isFetching} onClick={() => goTo(page - 1)}>Previous</Button>
      <Button disabled={rows.length !== RECEIPT_PAGE_SIZE || receipts.isFetching} onClick={() => goTo(page + 1)}>Next</Button>
    </div>}
    <p className="muted report-note">Purchases recorded before this screen existed remain in Reports → Purchases.</p>
    {recording && <PurchaseComposer onClose={() => setRecording(false)} />}
    {selected && <PurchaseDetail receipt={selected} onClose={() => setSelected(null)} />}
  </div>
}
