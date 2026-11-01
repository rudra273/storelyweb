import { PurchaseComposer } from '../purchases/PurchaseComposer'
import { useToast } from '../components/toastContext'
import { day, stockReason } from '../components/labels'
import { useState } from 'react'
import { Button } from '../components/workspace'
import { Alert, Loading } from '../components/ui'
import { when } from '../components/format'
import { describeError, useAction } from '../components/useAction'
import { formatMoney, formatQty } from '../lib/money'
import { AdjustStock } from './AdjustStock'
import { PriceBreakdown } from './PriceBreakdown'
import { ProductForm } from './ProductForm'
import { removeProduct, useProduct, useProductMutation } from './queries'

const KIND: Record<string, string> = { purchase: 'Stock in', sale: 'Sold', adjustment: 'Adjusted', return: 'Returned', void: 'Cancelled sale', stocktake: 'Stock count' }

export function ProductDetailPanel({ id, canEdit, onClose }: { id: string; canEdit: boolean; onClose: () => void }) {
  const detail = useProduct(id)
  const [mode, setMode] = useState<null | 'edit' | 'adjust' | 'purchase'>(null)
  const remove = useProductMutation(removeProduct)
  const { error, run, busy } = useAction()
  const toast = useToast()
  const p = detail.data?.product
  const movements = detail.data?.movements ?? []
  const pricing = detail.data?.pricing ?? undefined
  const out = !!p && p.track_stock && Number(p.quantity ?? 0) <= 0

  async function confirmDelete() {
    if (!p || !window.confirm(`Delete “${p.name}”? It disappears from the shop and from phones after they sync. Any remaining stock will be removed from inventory; past sales will remain in history.`)) return
    const ok = await run(async () => {
      await remove.mutateAsync(p.uuid)
      return true
    })
    if (ok) { onClose(); toast('Product deleted') }
  }

  return (
    <aside className="detail" aria-label="Product details">
      <p className="eyebrow">PRODUCT DETAILS</p><div className="modal-head">
        <h2>{p?.name ?? 'Product'}</h2>
        <button className="link" onClick={onClose} aria-label="Close details" disabled={busy}>
          ✕
        </button>
      </div>
      {detail.isPending && <Loading />}
      {detail.error && <Alert>{describeError(detail.error)} <button className="link" onClick={() => void detail.refetch()}>Retry product</button></Alert>}
      {error && <Alert>{error}</Alert>}
      {p && (
        <>
          <div className="product-overview"><span>Selling price</span><strong>{formatMoney(p.selling_price)}</strong><div className="product-stock-summary">{p.track_stock ? `${formatQty(p.quantity)} ${p.unit_name ?? ''} in stock` : 'Stock is not tracked'}{out ? <span className="badge warn">Out of stock</span> : p.low_stock && <span className="badge warn">Low stock</span>}</div></div>
          <dl className="facts">
            {p.mrp_price && (
              <>
                <dt>MRP</dt>
                <dd>{formatMoney(p.mrp_price)}</dd>
              </>
            )}
            {p.purchase_price !== undefined && (
              <>
                <dt>Cost price</dt>
                <dd>{formatMoney(p.purchase_price)}</dd>
              </>
            )}
            {p.reorder_level && (
              <>
                <dt>Reorder at</dt>
                <dd>{formatQty(p.reorder_level)}</dd>
              </>
            )}
            <dt>Category</dt>
            <dd>{p.category_name ?? '—'}</dd>
            <dt>Code / barcode</dt>
            <dd>{[p.product_code, p.barcode].filter(Boolean).join(' / ') || '—'}</dd>
            <dt>Priced by</dt>
            <dd>{p.price_mode === 'formula' ? 'Cost + margin' : 'Selling price you set'}</dd>
            <dt>GST</dt>
            <dd>{pricing
              ? `${formatQty(pricing.gst_percent)}% · ${pricing.gst_source === 'product' ? 'set on this product' : pricing.gst_source === 'category' ? `from ${pricing.category_name ?? 'the category'}` : 'your shop default'}`
              : p.gst_percent ? `${formatQty(p.gst_percent)}%` : 'Category or shop rate'}</dd>
            <dt>HSN</dt>
            <dd>{p.hsn_code ?? '—'}</dd>
            {p.next_expiry && (
              <>
                <dt>Next expiry</dt>
                <dd>{day(p.next_expiry)}</dd>
              </>
            )}
            <dt>Last changed</dt>
            <dd>{when(p.updated_at)}</dd>
          </dl>
          {pricing && <section className="detail-pricing" aria-label="How the price is made up"><h3>How the price is made up</h3><PriceBreakdown preview={pricing} pending={false} error={null} /></section>}
          {canEdit && (
            <div className="actions">
              <Button variant="primary" disabled={busy} onClick={() => setMode('edit')}>
                Edit
              </Button>
              {p.track_stock && <Button disabled={busy} onClick={() => setMode('purchase')}>Restock</Button>}
              <Button disabled={busy} onClick={() => setMode('adjust')}>Adjust stock</Button>
              <Button variant="danger" disabled={busy} onClick={confirmDelete}>
                {busy ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          )}
          <h3 className="detail-section-heading">Stock history</h3>
          {movements.length === 0 && <p className="muted">No stock movements yet.</p>}
          <ul className="plain history">
            {movements.map((m) => (
              <li key={m.uuid} className="row">
                <span>
                  {KIND[m.type] ?? m.type}
                  {m.reason ? ` · ${stockReason(m.reason)}` : ''}
                  <br />
                  {/* A web purchase receipt has a date only; the server stamps it noon shop time. */}
                  <small className="muted">
                    {/^\d{4}-\d{2}-\d{2}(T00:00(:00(\.0+)?)?Z?)?$/.test(m.created_at) || (m.type === 'purchase' && m.created_at.endsWith('T12:00:00+05:30')) ? day(m.created_at) : when(m.created_at)}
                    {m.notes ? ` · ${m.notes}` : ''}
                    {m.expiry_date ? ` · expires ${day(m.expiry_date)}` : ''}
                  </small>
                </span>
                <strong className={Number(m.quantity_delta) < 0 ? 'neg' : 'pos'}>
                  {Number(m.quantity_delta) > 0 ? '+' : ''}
                  {formatQty(m.quantity_delta)}
                </strong>
              </li>
            ))}
          </ul>
          {mode === 'purchase' && <PurchaseComposer initialProduct={p} onClose={() => setMode(null)} />}
          {mode === 'edit' && <ProductForm key={p.uuid} product={p} onClose={() => setMode(null)} onSaved={() => { setMode(null); toast('Changes saved') }} />}
          {mode === 'adjust' && <AdjustStock key={p.uuid} product={p} onClose={() => setMode(null)} />}
        </>
      )}
    </aside>
  )
}
