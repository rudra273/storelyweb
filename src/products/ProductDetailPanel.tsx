import { useState } from 'react'
import { Alert, Loading } from '../components/ui'
import { when } from '../components/format'
import { describeError, useAction } from '../components/useAction'
import { formatMoney, formatQty } from '../lib/money'
import { AdjustStock } from './AdjustStock'
import { ProductForm } from './ProductForm'
import { removeProduct, useProduct, useProductMutation } from './queries'

const KIND: Record<string, string> = { purchase: 'Stock in', sale: 'Sold', adjustment: 'Adjusted', return: 'Returned', void: 'Cancelled sale', stocktake: 'Stock count' }

export function ProductDetailPanel({ id, canEdit, onClose }: { id: string; canEdit: boolean; onClose: () => void }) {
  const detail = useProduct(id)
  const [mode, setMode] = useState<null | 'edit' | 'adjust'>(null)
  const remove = useProductMutation(removeProduct)
  const { error, run } = useAction()
  const p = detail.data?.product
  const movements = detail.data?.movements ?? []

  async function confirmDelete() {
    if (!p || !window.confirm(`Delete “${p.name}”? It disappears from the shop and from phones after they sync.`)) return
    const ok = await run(async () => {
      await remove.mutateAsync(p.uuid)
      return true
    })
    if (ok) onClose()
  }

  return (
    <aside className="detail" aria-label="Product details">
      <div className="modal-head">
        <h2>{p?.name ?? 'Product'}</h2>
        <button className="link" onClick={onClose} aria-label="Close details">
          ✕
        </button>
      </div>
      {detail.isPending && <Loading />}
      {detail.error && <Alert>{describeError(detail.error)}</Alert>}
      {error && <Alert>{error}</Alert>}
      {p && (
        <>
          <dl className="facts">
            <dt>Selling price</dt>
            <dd>{formatMoney(p.selling_price)}</dd>
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
            <dt>In stock</dt>
            <dd>
              {p.track_stock ? `${formatQty(p.quantity)} ${p.unit_name ?? ''}` : 'Stock is not tracked'}
              {p.low_stock && <span className="badge warn">low</span>}
            </dd>
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
            <dt>HSN · GST</dt>
            <dd>
              {p.hsn_code ?? '—'} · {p.gst_percent ? `${formatQty(p.gst_percent)}%` : '—'}
            </dd>
            {p.next_expiry && (
              <>
                <dt>Next expiry</dt>
                <dd>{p.next_expiry}</dd>
              </>
            )}
            <dt>Last changed</dt>
            <dd>{when(p.updated_at)}</dd>
          </dl>
          {canEdit && (
            <div className="actions">
              <button className="primary" onClick={() => setMode('edit')}>
                Edit
              </button>
              <button onClick={() => setMode('adjust')}>Adjust stock</button>
              <button className="danger-button" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          )}
          <h3>Stock history</h3>
          {movements.length === 0 && <p className="muted">No stock movements yet.</p>}
          <ul className="plain history">
            {movements.map((m) => (
              <li key={m.uuid} className="row">
                <span>
                  {KIND[m.type] ?? m.type}
                  {m.reason ? ` · ${m.reason.replace('_', ' ')}` : ''}
                  <br />
                  <small className="muted">
                    {when(m.created_at)}
                    {m.notes ? ` · ${m.notes}` : ''}
                    {m.expiry_date ? ` · expires ${m.expiry_date}` : ''}
                  </small>
                </span>
                <strong className={Number(m.quantity_delta) < 0 ? 'neg' : 'pos'}>
                  {Number(m.quantity_delta) > 0 ? '+' : ''}
                  {formatQty(m.quantity_delta)}
                </strong>
              </li>
            ))}
          </ul>
          {mode === 'edit' && <ProductForm product={p} onClose={() => setMode(null)} onSaved={() => setMode(null)} />}
          {mode === 'adjust' && <AdjustStock product={p} onClose={() => setMode(null)} />}
        </>
      )}
    </aside>
  )
}
