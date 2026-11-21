import { Alert } from '../../components/ui/ui'
import { describeError } from '../../components/useAction'
import { formatMoney } from '../../lib/money'
import type { PricePreview } from '../queries'

const SOURCE = { product: 'set on this product', category: 'from the category', shop: 'your shop default' }

/** Every number behind a product's price, as the server works it out: nothing is
 * applied (a default GST rate, say) without the owner seeing it here. */
export function PriceBreakdown({ preview, pending, error }: { preview: PricePreview | undefined; pending: boolean; error: Error | null }) {
  if (error) return <Alert>{describeError(error)}</Alert>
  if (!preview) return <p className="muted price-breakdown">{pending ? 'Working out the price…' : 'Enter the prices above to see how this product is priced.'}</p>
  const p = preview
  const gst = `${Number(p.gst_percent)}%, ${p.category_name && p.gst_source === 'category' ? `from ${p.category_name}` : SOURCE[p.gst_source]}`
  // A cost of 0 means no cost price was entered, so there is no profit to show.
  const rows: [string, string][] = !p.cost_known
    ? p.gst_registered && p.price_mode === 'fixed' ? [[`GST in the price (${gst})`, formatMoney(p.output_gst_amount)]] : []
    : p.price_mode === 'formula'
    ? [
        ['Cost price', formatMoney(p.purchase_price)],
        ...(Number(p.purchase_gst_amount) ? [[`+ GST paid on purchase (${gst})`, formatMoney(p.purchase_gst_amount)] as [string, string]] : []),
        ...(Number(p.overhead_cost) ? [['+ Overhead', formatMoney(p.overhead_cost)] as [string, string]] : []),
        ['= Total cost', formatMoney(p.total_cost)],
        [`+ Margin ${Number(p.profit_margin_percent)}%`, formatMoney(p.profit_amount)],
        ...(p.gst_registered ? [[`+ GST charged to the customer (${gst})`, formatMoney(p.output_gst_amount)] as [string, string]] : []),
      ]
    : [
        ['Total cost', formatMoney(p.total_cost) + (Number(p.purchase_gst_amount) ? ` (includes ${formatMoney(p.purchase_gst_amount)} GST paid on purchase at ${gst})` : '')],
        ...(p.gst_registered ? [[`GST in the price (${gst})`, formatMoney(p.output_gst_amount)] as [string, string]] : []),
        ['Profit per unit', formatMoney(p.profit_amount)],
      ]
  return (
    <div className="price-breakdown" aria-live="polite" aria-busy={pending}>
      <dl>
        {rows.map(([label, value]) => <div className="row" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        <div className="row grand-total"><dt>Sells at</dt><dd>{formatMoney(p.selling_price)}</dd></div>
      </dl>
      {!p.cost_known && <p className="muted">Add a cost price to see profit.</p>}
      <small className="muted">{p.gst_registered
        ? 'GST is charged on invoices. The pricing calculation excludes purchase GST from cost.'
        : 'GST is not charged on invoices. The pricing calculation includes purchase GST in cost.'}</small>
    </div>
  )
}
