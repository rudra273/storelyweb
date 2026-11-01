import { receiptMoney } from './money'
import { day, paymentStatus } from '../components/labels'
import { Modal } from '../components/Modal'
import { formatQty } from '../lib/money'
import type { Receipt } from './contracts'

export function PurchaseSummary({ receipt }: { receipt: Receipt }) {
  return <>
    <dl className="facts"><dt>Receipt date</dt><dd>{day(receipt.purchase_date)}</dd><dt>Supplier</dt><dd>{receipt.supplier_name ?? 'No supplier'}</dd><dt>Supplier invoice</dt><dd>{receipt.invoice_number ?? '—'}</dd><dt>Payment</dt><dd>{paymentStatus(receipt.payment_status)}</dd></dl>
    <div className="table-wrap"><table className="table"><thead><tr><th>Product</th><th>Quantity</th><th>Unit cost</th><th>Amount</th><th>Batch / expiry</th></tr></thead><tbody>{receipt.items.map(line => <tr key={line.uuid}><td>{line.product_name}</td><td>{formatQty(line.quantity)} {line.unit_name}</td><td>{receiptMoney(line.unit_cost)}</td><td>{receiptMoney(line.amount)}</td><td>{line.batch_no ?? '—'}{line.expiry_date && <><br />{line.expiry_date}</>}</td></tr>)}</tbody></table></div>
    <p>Stock cost subtotal: <strong>{receiptMoney(receipt.subtotal)}</strong></p>
    {receipt.notes && <p>{receipt.notes}</p>}
    {receipt.total != null && <dl className="facts">
      <dt>GST</dt><dd>{receiptMoney(receipt.tax_amount ?? '0')}</dd>
      <dt>Other charges</dt><dd>{receiptMoney(receipt.charges_amount ?? '0')}</dd>
      <dt>Discount</dt><dd>{receiptMoney(receipt.discount_amount ?? '0')}</dd>
      <dt>Total</dt><dd>{receiptMoney(receipt.total)}</dd>
      <dt>Balance due</dt><dd>{receipt.balance_due == null ? 'Not recorded' : receiptMoney(receipt.balance_due)}</dd>
      {receipt.due_date && <><dt>Due date</dt><dd>{day(receipt.due_date)}</dd></>}
    </dl>}
    {receipt.payments?.map(p => <p key={p.uuid}>{day(p.payment_date)} · {receiptMoney(p.amount)} · {p.payment_method}</p>)}
    {receipt.payment_status === 'not_recorded' && <p className="muted">Payment is not recorded; this receipt does not count towards supplier dues.</p>}
  </>
}
export function PurchaseDetail({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  return <Modal title="Purchase receipt" onClose={onClose} wide><PurchaseSummary receipt={receipt} /></Modal>
}
