import { receiptMoney } from './money'
import { day } from '../components/labels'
import { Modal } from '../components/Modal'
import { formatQty } from '../lib/money'
import type { Receipt } from './contracts'

export function PurchaseSummary({ receipt }: { receipt: Receipt }) {
  return <>
    <dl className="facts"><dt>Receipt date</dt><dd>{day(receipt.purchase_date)}</dd><dt>Supplier</dt><dd>{receipt.supplier_name ?? 'No supplier'}</dd><dt>Supplier invoice</dt><dd>{receipt.invoice_number ?? '—'}</dd><dt>Payment</dt><dd>Not recorded</dd></dl>
    <div className="table-wrap"><table className="table"><thead><tr><th>Product</th><th>Quantity</th><th>Unit cost</th><th>Amount</th><th>Batch / expiry</th></tr></thead><tbody>{receipt.items.map(line => <tr key={line.uuid}><td>{line.product_name}</td><td>{formatQty(line.quantity)} {line.unit_name}</td><td>{receiptMoney(line.unit_cost)}</td><td>{receiptMoney(line.amount)}</td><td>{line.batch_no ?? '—'}{line.expiry_date && <><br />{line.expiry_date}</>}</td></tr>)}</tbody></table></div>
    <p>Stock cost subtotal: <strong>{receiptMoney(receipt.subtotal)}</strong></p>
    {receipt.notes && <p>{receipt.notes}</p>}
    <p className="muted">Payment, tax and additional charges are not recorded in this receipt.</p>
  </>
}
export function PurchaseDetail({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  return <Modal title="Purchase receipt" onClose={onClose} wide><PurchaseSummary receipt={receipt} /></Modal>
}
