import { useQuery } from '@tanstack/react-query'
import JsBarcode from 'jsbarcode'
import { BARCODE_OPTIONS, canEncode } from '../../lib/barcode'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Alert, Loading } from '../../components/ui/ui'
import { formatMoney } from '../../lib/money'
import { useShop } from '../../shops/context'
import { fetchLabelData, type BulkScope } from '../queries'

const MAX_COPIES = 50

/** Draws the barcode into an <svg> through the DOM, so no markup is ever built from text. */
function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (ref.current) JsBarcode(ref.current, value, BARCODE_OPTIONS)
  }, [value])
  return <svg ref={ref} role="img" aria-label={`Barcode ${value}`} />
}

/** A sheet of labels (name, price, barcode) for the chosen products, printed by the browser. The server
 * resolves the selection, so "all matching products" prints the whole filter, not just the page. */
export function Labels({ scope, onClose }: { scope: BulkScope; onClose: () => void }) {
  const { current } = useShop()
  const shop = current?.shop_id ?? ''
  const [copies, setCopies] = useState(1)
  useEffect(() => {
    // While this dialog is open, printing means printing the labels, not the page behind.
    document.body.classList.add('printing-labels')
    return () => document.body.classList.remove('printing-labels')
  }, [])
  const labels = useQuery({ queryKey: ['label-data', shop, JSON.stringify(scope)], queryFn: () => fetchLabelData(shop, scope), enabled: !!shop, staleTime: 0, gcTime: 0 })
  const failed = labels.isError
  const loading = labels.isPending
  const items = useMemo(
    () =>
      (labels.data ?? []).map((p) => {
        const value = p.barcode || p.product_code
        return { id: p.uuid, name: p.name, price: p.selling_price, value: value && canEncode(value) ? value : null }
      }),
    [labels.data],
  )
  const skipped = items.filter((i) => !i.value).length

  return (
    <Modal title={`Print labels · ${items.length || ''}`.replace(/ · $/, '')} onClose={onClose} wide>
      <div className="no-print">
        <p className="muted">Uses each product’s barcode, or its code when it has no barcode.</p>
        <div className="field narrow">
          <label htmlFor="copies">Copies of each label</label>
          <input id="copies" type="number" min={1} max={MAX_COPIES} value={copies} onChange={(e) => setCopies(Math.min(MAX_COPIES, Math.max(1, Number(e.target.value) || 1)))} />
        </div>
        {loading && <Loading />}
        {failed && <Alert>Labels could not be loaded. <button className="link" onClick={() => void labels.refetch()}>Retry labels</button></Alert>}
        {skipped > 0 && <Alert kind="info">{skipped} product{skipped === 1 ? ' has' : 's have'} no usable barcode or code and will be left out.</Alert>}
        <div className="actions">
          <button className="primary" disabled={loading || failed || items.length === skipped} onClick={() => window.print()}>
            Print
          </button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
      <div className="label-sheet" aria-label="Label preview">
        {items
          .filter((i) => i.value)
          .flatMap((i) => Array.from({ length: copies }, (_, n) => ({ ...i, key: `${i.id}-${n}` })))
          .map((i) => (
            <div key={i.key} className="label">
              <div className="label-name">{i.name}</div>
              <div className="label-price">{formatMoney(i.price)}</div>
              <div className="label-code">{i.value && <Barcode value={i.value} />}</div>
            </div>
          ))}
      </div>
    </Modal>
  )
}
