import { useState } from 'react'
import { Modal } from '../components/ui/Modal'
import { Alert, Loading } from '../components/ui/ui'
import { Button } from '../components/ui/workspace'
import { receiptMoney } from './composer/money'
import { PurchaseDetail } from './PurchaseDetail'
import { RECEIPT_PAGE_SIZE, useReceipts } from './queries'
import type { Receipt } from './composer/contracts'

export function PurchaseHistory({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Receipt | null>(null)
  const receipts = useReceipts(page)
  return <Modal title="Purchase history" onClose={onClose} wide>
    <p className="muted">Receipts saved with the new purchase flow. Older stock entries remain in Reports → Purchases.</p>
    {receipts.isPending && <Loading />}
    {receipts.error && <Alert>Purchases could not be loaded. <Button onClick={() => void receipts.refetch()}>Retry history</Button></Alert>}
    {receipts.data?.length === 0 && <p>No purchase receipts on this page.</p>}
    {!!receipts.data?.length && <div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Supplier</th><th>Invoice</th><th>Stock cost</th><th>Payment</th><th>Details</th></tr></thead><tbody>{receipts.data.map(receipt => <tr key={receipt.uuid}><td>{receipt.purchase_date}</td><td>{receipt.supplier_name ?? 'No supplier'}</td><td>{receipt.invoice_number ?? '—'}</td><td>{receiptMoney(receipt.subtotal)}</td><td>Not recorded</td><td><Button onClick={() => setSelected(receipt)}>View purchase {receipt.invoice_number ?? receipt.purchase_date}</Button></td></tr>)}</tbody></table></div>}
    <div className="actions"><Button disabled={page === 0 || receipts.isFetching} onClick={() => setPage(page - 1)}>Previous purchases</Button><Button disabled={receipts.data?.length !== RECEIPT_PAGE_SIZE || receipts.isFetching} onClick={() => setPage(page + 1)}>More purchases</Button></div>
    {selected && <PurchaseDetail receipt={selected} onClose={() => setSelected(null)} />}
  </Modal>
}
