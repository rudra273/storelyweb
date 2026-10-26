import a4 from './paper-a4.css?url'
import a5 from './paper-a5.css?url'
import { useState } from 'react'
import { Alert, Loading } from '../components/ui'
import { describeError } from '../components/useAction'
import { formatMoney, formatQty } from '../lib/money'
import { useBillingQuery, type BillDetail, type InvoiceSettings } from './queries'

export function Invoice({ detail }: { detail: BillDetail }) {
  const query = useBillingQuery<InvoiceSettings>('invoice-settings', 'invoice-settings')
  const [paper, setPaper] = useState<'A4' | 'A5' | null>(null)
  if (query.isPending) return <Loading label="Loading invoice settings…" />
  if (query.error || !query.data) return <Alert>{describeError(query.error)}</Alert>
  const s = query.data
  const b = detail.bill
  const selectedPaper = paper ?? (s.paper_size.toUpperCase() === 'A5' ? 'A5' : 'A4')
  return <>
    <div className="actions no-print"><label>Paper size<select value={selectedPaper} onChange={e => setPaper(e.target.value as typeof paper)}><option>A4</option><option>A5</option></select></label><button onClick={() => window.print()}>Print / Save as PDF</button><span className="muted">Choose “Save as PDF” in the print dialog to download.</span></div>
    <link rel="stylesheet" href={selectedPaper === 'A4' ? a4 : a5} />
    <article className="invoice" aria-label="Invoice">
      <header><h2>{s.shop_name}</h2><p>{s.shop_address}<br />{[s.shop_phone, s.shop_email].filter(Boolean).join(' · ')}</p>{s.shop_gstin && <p>GSTIN: {s.shop_gstin}</p>}<h3>{b.document_type === 'credit_note' ? 'Credit note' : s.invoice_title}</h3></header>
      {b.cancelled && <strong>CANCELLED · {b.cancel_reason}</strong>}
      <div className="row"><strong>{b.bill_number}</strong><span>{b.created_at.slice(0, 10)}</span></div>
      <p><strong>{b.customer_gst_legal_name || b.customer_name}</strong><br />{b.customer_phone}<br />{b.customer_address_snapshot}</p>
      {b.customer_gstin && <p>Customer GSTIN: {b.customer_gstin}</p>}{b.place_of_supply_state_code && <p>Place of supply: {b.place_of_supply_state_code}</p>}
      {b.original_bill_number && <p>Against invoice {b.original_bill_number}</p>}
      <table className="table"><thead><tr><th>Item / HSN</th><th>Qty</th><th>Rate</th><th>Taxable</th><th>GST</th><th>Amount</th></tr></thead><tbody>{detail.items.map(i => <tr key={i.uuid}><td>{i.product_name}<br /><small>{i.hsn_code}</small></td><td>{formatQty(i.quantity)} {i.unit}</td><td>{formatMoney(i.selling_price)}</td><td>{formatMoney(i.line_taxable_value)}</td><td>{formatMoney(i.line_gst)}<br /><small>{s.gst_registered && i.gst_percent ? `${i.gst_percent}%` : ''}</small></td><td>{formatMoney(i.amount)}</td></tr>)}</tbody></table>
      <dl className="bill-totals">{[['Subtotal', b.subtotal_amount], ['Discount', b.discount_amount], ['Taxable', b.taxable_amount], ['CGST', b.cgst_amount], ['SGST', b.sgst_amount], ['IGST', b.igst_amount], ['Round-off', b.round_off_amount], ['Total', b.total_amount], ['Paid', b.paid_amount], ['Due', b.balance_due]].map(([k, v]) => <div className="row" key={k}><dt>{k}</dt><dd>{formatMoney(v)}</dd></div>)}</dl>
      {s.upi_id && <p>UPI: {s.upi_id}</p>}{s.bank_details && <p>{s.bank_details}</p>}{s.terms_text && <p>{s.terms_text}</p>}<footer>{s.footer_text}</footer>
    </article>
  </>
}
