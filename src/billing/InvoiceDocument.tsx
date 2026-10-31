import { QRCodeSVG } from 'qrcode.react'
import { formatMoney, formatQty } from '../lib/money'
import { stateLabel } from '../lib/states'
import { amountInWords } from '../lib/words'
import { documentTitle } from './invoiceTitle'
import type { BillDetail, InvoiceSettings } from './queries'

export type Paper = 'A4' | 'A5' | '80mm' | '58mm'

const METHOD: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank transfer', online: 'Online' }

function day(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

/** A standard Indian GST invoice. Every figure is the server's; this only lays them out,
 * following the shop's invoice settings (the same switches as the phone app). */
export function InvoiceDocument({ detail, settings: s, paper }: { detail: BillDetail; settings: InvoiceSettings; paper: Paper }) {
  const show = (key: string) => s.show[key] !== false
  const b = detail.bill
  const thermal = paper === '80mm' || paper === '58mm'
  const inter = Number(b.igst_amount) !== 0
  const hasGst = Number(b.cgst_amount) !== 0 || Number(b.sgst_amount) !== 0 || inter
  const due = Number(b.balance_due) > 0
  const upi = show('show_upi_qr') && s.upi_id && due && b.document_type !== 'credit_note'
    ? `upi://pay?pa=${encodeURIComponent(s.upi_id)}&pn=${encodeURIComponent(s.shop_name)}&am=${b.balance_due}&cu=INR&tn=${encodeURIComponent(b.bill_number)}`
    : null
  // Columns that wrap on a till roll are dropped there: item, quantity, rate and amount stay.
  const columns = [
    { key: 'show_item_serial_column', label: '#', cell: (_: unknown, n: number) => n + 1, thermal: false },
    { key: 'show_item_name_column', label: 'Item', cell: (i: Item) => i.product_name, thermal: true },
    { key: 'show_hsn_column', label: 'HSN/SAC', cell: (i: Item) => i.hsn_code ?? '', thermal: false },
    { key: 'show_quantity_column', label: 'Qty', cell: (i: Item) => `${formatQty(i.quantity)}${i.unit ? ` ${i.unit}` : ''}`, thermal: true, num: true },
    { key: 'show_rate_column', label: 'Rate', cell: (i: Item) => formatMoney(i.selling_price), thermal: true, num: true },
    { key: 'show_taxable_amount', label: 'Taxable', cell: (i: Item) => formatMoney(i.line_taxable_value), thermal: false, num: true, gst: true },
    { key: 'show_gst_percent_column', label: 'GST %', cell: (i: Item) => i.gst_percent != null ? `${formatQty(i.gst_percent)}%` : '', thermal: false, num: true, gst: true },
    { key: 'show_gst_amount_column', label: 'GST', cell: (i: Item) => formatMoney(i.line_gst), thermal: false, num: true, gst: true },
    { key: 'show_amount_column', label: 'Amount', cell: (i: Item) => formatMoney(i.amount), thermal: true, num: true },
  ].filter(c => show(c.key) && (!thermal || c.thermal) && (!c.gst || hasGst) && (c.key !== 'show_hsn_column' || detail.items.some(i => i.hsn_code)))
  const hsn = hasGst && show('show_hsn_summary') && !thermal ? hsnSummary(detail.items) : []
  const totals: [string, string, string][] = ([
    ['show_subtotal', 'Subtotal', b.subtotal_amount],
    ['show_discount', `Discount${Number(b.discount_percent) ? ` (${formatQty(b.discount_percent)}%)` : ''}`, b.discount_amount],
    ['show_taxable_amount', 'Taxable value', b.taxable_amount],
    ...(show('show_cgst_sgst_igst') && hasGst ? (inter ? [['show_cgst_sgst_igst', 'IGST', b.igst_amount]] : [['show_cgst_sgst_igst', 'CGST', b.cgst_amount], ['show_cgst_sgst_igst', 'SGST', b.sgst_amount]]) : []),
    ['show_grand_total', 'Round-off', b.round_off_amount],
  ] as [string, string, string][]).filter(([key, label, value]) => show(key) && !(label.startsWith('Discount') && !Number(value)) && !(label === 'Round-off' && !Number(value)) && !(label === 'Taxable value' && !hasGst))

  return (
    <article className={`invoice ${thermal ? `thermal paper-${paper}` : ''}`} aria-label="Invoice">
      <header className="invoice-head">
        {show('show_shop_name') && <h2>{s.shop_name}</h2>}
        {show('show_shop_address') && s.shop_address && <p>{s.shop_address}</p>}
        {(show('show_shop_phone') && s.shop_phone) || (show('show_shop_email') && s.shop_email)
          ? <p>{[show('show_shop_phone') && s.shop_phone && `Phone: ${s.shop_phone}`, show('show_shop_email') && s.shop_email].filter(Boolean).join(' · ')}</p> : null}
        {show('show_shop_gstin') && s.shop_gstin && <p><strong>GSTIN: {s.shop_gstin}</strong></p>}
        {show('show_invoice_title') && <h3 className="invoice-title">{documentTitle(s, b)}</h3>}
        {s.gst_scheme === 'composition' && b.document_type !== 'credit_note' && <p className="invoice-note">Composition taxable person, not eligible to collect tax on supplies.</p>}
      </header>
      {b.cancelled && <p className="invoice-cancelled">CANCELLED{b.cancel_reason ? ` · ${b.cancel_reason}` : ''}</p>}

      <section className="invoice-parties">
        <div>
          <h4>Bill to</h4>
          {show('show_customer_name') && <p><strong>{b.customer_name}</strong></p>}
          {show('show_customer_legal_name') && b.customer_gst_legal_name && b.customer_gst_legal_name !== b.customer_name && <p>{b.customer_gst_legal_name}</p>}
          {show('show_customer_address') && b.customer_address_snapshot && <p>{b.customer_address_snapshot}</p>}
          {show('show_customer_phone') && b.customer_phone && <p>Phone: {b.customer_phone}</p>}
          {show('show_customer_gstin') && b.customer_gstin && <p>GSTIN: {b.customer_gstin}</p>}
          {show('show_customer_place_of_supply') && b.place_of_supply_state_code && <p>State: {stateLabel(b.place_of_supply_state_code)}</p>}
        </div>
        <dl className="invoice-meta">
          {show('show_invoice_number') && <><dt>{b.document_type === 'credit_note' ? 'Credit note no.' : 'Invoice no.'}</dt><dd>{b.bill_number}</dd></>}
          {show('show_invoice_date') && <><dt>Date</dt><dd>{day(b.created_at)}</dd></>}
          {b.original_bill_number && <><dt>Against invoice</dt><dd>{b.original_bill_number}</dd></>}
          {show('show_invoice_place_of_supply') && (b.place_of_supply_state_code || s.shop_gstin) && <><dt>Place of supply</dt><dd>{stateLabel(b.place_of_supply_state_code ?? s.shop_gstin?.slice(0, 2))}</dd></>}
          {show('show_invoice_supply_type') && hasGst && <><dt>Supply</dt><dd>{inter ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}</dd></>}
        </dl>
      </section>

      <div className="invoice-table"><table className="table">
        <thead><tr>{columns.map(c => <th key={c.key} className={c.num ? 'num' : undefined}>{c.label}</th>)}</tr></thead>
        <tbody>{detail.items.map((item, n) => <tr key={item.uuid}>{columns.map(c => <td key={c.key} className={c.num ? 'num' : undefined}>{c.cell(item, n)}</td>)}</tr>)}</tbody>
      </table></div>

      <div className="invoice-summary">
        <div className="invoice-words">
          {show('show_amount_in_words') && <p><span className="muted">Amount in words</span><br /><strong>{amountInWords(b.total_amount)}</strong></p>}
        </div>
        <dl className="bill-totals">
          {totals.map(([, label, value]) => <div className="row" key={label}><dt>{label}</dt><dd>{formatMoney(value)}</dd></div>)}
          {show('show_grand_total') && <div className="row grand-total"><dt>Total</dt><dd>{formatMoney(b.total_amount)}</dd></div>}
          {show('show_payment_details') && b.document_type !== 'credit_note' && <>
            <div className="row"><dt>Paid</dt><dd>{formatMoney(b.paid_amount)}</dd></div>
            {due && <div className="row due"><dt>Balance due</dt><dd>{formatMoney(b.balance_due)}</dd></div>}
          </>}
        </dl>
      </div>

      {hsn.length > 0 && <table className="table hsn-summary"><caption>Tax summary by HSN</caption><thead><tr><th>HSN/SAC</th><th className="num">Taxable value</th><th className="num">GST rate</th><th className="num">Tax</th></tr></thead><tbody>{hsn.map(h => <tr key={`${h.hsn}-${h.rate}`}><td>{h.hsn || '—'}</td><td className="num">{formatMoney(h.taxable.toFixed(2))}</td><td className="num">{h.rate}%</td><td className="num">{formatMoney(h.tax.toFixed(2))}</td></tr>)}</tbody></table>}
      {show('show_payment_details') && detail.payments.length > 0 && <p className="invoice-payments">Received: {detail.payments.map(p => `${formatMoney(p.amount)} by ${METHOD[p.payment_method] ?? p.payment_method}${p.payment_reference ? ` (${p.payment_reference})` : ''}`).join(', ')}</p>}
      <section className="invoice-extras">
        {upi && <div className="invoice-upi"><QRCodeSVG value={upi} size={thermal ? 96 : 112} level="M" marginSize={2} role="img" aria-label={`UPI QR code to pay ${formatMoney(b.balance_due)}`} /><small>Scan to pay {formatMoney(b.balance_due)}<br />{s.upi_id}</small></div>}
        {s.bank_details && !thermal && <div><h4>Bank details</h4><p>{s.bank_details}</p></div>}
        {s.terms_text && <div><h4>Terms</h4><p>{s.terms_text}</p></div>}
      </section>
      {!thermal && <p className="invoice-sign">For {s.shop_name}<br /><br />Authorised signatory</p>}
      {show('show_footer_text') && s.footer_text && <footer>{s.footer_text}</footer>}
    </article>
  )
}

type Item = BillDetail['items'][number]

/** Tax by HSN and rate, from the server's line values (display grouping only). */
function hsnSummary(items: Item[]) {
  const groups = new Map<string, { hsn: string; rate: string; taxable: number; tax: number }>()
  for (const i of items) {
    const rate = i.gst_percent != null ? formatQty(i.gst_percent) : '0'
    const key = `${i.hsn_code ?? ''}|${rate}`
    const g = groups.get(key) ?? { hsn: i.hsn_code ?? '', rate, taxable: 0, tax: 0 }
    g.taxable += Number(i.line_taxable_value)
    g.tax += Number(i.line_gst)
    groups.set(key, g)
  }
  return [...groups.values()]
}
