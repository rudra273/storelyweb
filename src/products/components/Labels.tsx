import { useQuery } from '@tanstack/react-query'
import JsBarcode from 'jsbarcode'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Alert, Loading } from '../../components/ui/ui'
import { Button } from '../../components/ui/workspace'
import { BARCODE_OPTIONS, canEncode } from '../../lib/barcode'
import { formatMoney } from '../../lib/money'
import { useShop } from '../../shops/context'
import { fetchLabelData, type BulkScope } from '../queries'
import { A4, CUSTOM_ID, MAX_LABELS, PRESETS, labelsPerPage, layoutOf, layoutProblem, loadSaved, pageRule, paginate, save, type Layout, type Options, type Saved } from '../labels/layout'

const MAX_COPIES = 200
// Code 128 needs empty space of at least ten bar widths on each side of the bars to scan reliably.
const BAR_WIDTH = 1.6
const QUIET_ZONE = BAR_WIDTH * 10

interface Item { id: string; name: string; price: string | null; value: string | null }

const TEST: Item = { id: 'test', name: 'Test label', price: '123.45', value: 'TEST-0001' }

/** Draws the barcode into an <svg> through the DOM, so no markup is ever built from text.
 * The margin is the quiet zone a scanner needs on each side of the bars. */
function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (ref.current) JsBarcode(ref.current, value, { ...BARCODE_OPTIONS, margin: QUIET_ZONE, height: 34, width: BAR_WIDTH })
  }, [value])
  return <svg ref={ref} role="img" aria-label={`Barcode ${value}`} />
}

function Label({ item, layout, options, shopName }: { item: Item; layout: Layout; options: Options; shopName: string }) {
  return <div className="label" style={{ width: `${layout.width}mm`, height: `${layout.height}mm` }}>
    {options.shop && shopName && <div className="label-shop">{shopName}</div>}
    <div className="label-name" title={item.name}>{item.name}</div>
    {options.price && item.price !== null && <div className="label-price">{formatMoney(item.price)}</div>}
    <div className="label-code">{item.value && <Barcode value={item.value} />}</div>
  </div>
}

/** One printed page: a whole A4 sheet with the labels in their real places, or one roll label. */
function Page({ cells, layout, options, shopName }: { cells: (Item | null)[]; layout: Layout; options: Options; shopName: string }) {
  const roll = layout.kind === 'roll'
  return <div className="label-page" style={{ width: `${roll ? layout.width : A4.width}mm`, height: `${roll ? layout.height : A4.height}mm` }}>
    <div className="label-grid" style={{ left: `${layout.left}mm`, top: `${layout.top}mm`, gridTemplateColumns: `repeat(${layout.cols}, ${layout.width}mm)`, gridAutoRows: `${layout.height}mm`, columnGap: `${layout.gapX}mm`, rowGap: `${layout.gapY}mm` }}>
      {cells.map((cell, i) => cell ? <Label key={i} item={cell} layout={layout} options={options} shopName={shopName} /> : <div key={i} className="label-used" aria-hidden="true" />)}
    </div>
  </div>
}

const FIELDS: { key: keyof Layout; label: string; sheetOnly?: boolean }[] = [
  { key: 'width', label: 'Label width (mm)' }, { key: 'height', label: 'Label height (mm)' },
  { key: 'cols', label: 'Labels across', sheetOnly: true }, { key: 'rows', label: 'Rows down', sheetOnly: true },
  { key: 'left', label: 'Left margin (mm)', sheetOnly: true }, { key: 'top', label: 'Top margin (mm)', sheetOnly: true },
  { key: 'gapX', label: 'Gap across (mm)', sheetOnly: true }, { key: 'gapY', label: 'Gap down (mm)', sheetOnly: true },
]

/**
 * Labels for the chosen products, printed by the browser at their real size. The server resolves the
 * selection, so "all matching products" prints the whole filter, not just the page. Layout is chosen
 * here (a sheet of adhesive labels or a label roll) and kept on this device; it is separate from invoice paper.
 */
export function Labels({ scope, onClose }: { scope: BulkScope; onClose: () => void }) {
  const { current } = useShop()
  const shop = current?.shop_id ?? ''
  const shopName = current?.name ?? ''
  const [saved, setSaved] = useState<Saved>(() => loadSaved(shop))
  const [text, setText] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map(f => [f.key, String(saved.custom[f.key as keyof Layout])])))
  const [start, setStart] = useState('1')
  const [copies, setCopies] = useState<Record<string, string>>({})
  const [same, setSame] = useState('1')
  const [testing, setTesting] = useState(false)

  const custom: Layout = { ...saved.custom, ...Object.fromEntries(FIELDS.map(f => [f.key, Number(text[f.key])])) } as Layout
  const layout = layoutOf(saved.preset, saved.preset === CUSTOM_ID ? custom : saved.custom)
  const problem = layoutProblem(layout)
  const layoutKey = JSON.stringify(layout)

  useEffect(() => {
    // While this dialog is open, printing means printing the labels, not the page behind. The page rule
    // makes the browser print at the real paper size.
    document.body.classList.add('printing-labels')
    const rule = document.createElement('style')
    rule.dataset.labelPage = ''
    rule.textContent = pageRule(JSON.parse(layoutKey) as Layout)
    document.head.append(rule)
    return () => { document.body.classList.remove('printing-labels'); rule.remove() }
  }, [layoutKey])

  const labels = useQuery({ queryKey: ['label-data', shop, JSON.stringify(scope)], queryFn: () => fetchLabelData(shop, scope), enabled: !!shop, staleTime: 0, gcTime: 0 })
  const failed = labels.isError
  const loading = labels.isPending
  const items: Item[] = useMemo(() => (labels.data ?? []).map(p => {
    const value = p.barcode || p.product_code
    return { id: p.uuid, name: p.name, price: p.selling_price ?? null, value: value && canEncode(value) ? value : null }
  }), [labels.data])
  const printable = items.filter(i => i.value)
  const unusable = items.filter(i => !i.value)

  // Copies are kept as typed, so a field can be cleared and retyped; they are limited only when counted.
  const clampCopies = (text: string) => Math.min(MAX_COPIES, Math.max(1, Math.floor(Number(text)) || 1))
  const copiesOf = (id: string) => clampCopies(copies[id] ?? '1')
  const expanded = printable.flatMap(i => Array.from({ length: copiesOf(i.id) }, () => i))
  const startSlot = Number(start) || 1
  const pages = problem ? [] : testing ? paginate([TEST], layout, startSlot) : paginate(expanded, layout, startSlot)
  const total = testing ? 1 : expanded.length
  const tooMany = total > MAX_LABELS

  const choose = (patch: Partial<Saved>) => {
    const next = { ...saved, ...patch }
    setSaved(next)
    if (!layoutProblem(layoutOf(next.preset, next.custom))) save(shop, next)
  }
  const pick = (preset: string) => {
    if (preset === CUSTOM_ID) {
      const from = layoutOf(saved.preset, saved.custom)
      setText(Object.fromEntries(FIELDS.map(f => [f.key, String(from[f.key as keyof Layout])])))
      choose({ preset, custom: from })
    } else choose({ preset })
  }
  const edit = (key: keyof Layout, value: string) => {
    setText(t => ({ ...t, [key]: value }))
    const next = { ...custom, [key]: Number(value) } as Layout
    if (!layoutProblem(next)) choose({ custom: next })
  }
  const setAll = () => setCopies(Object.fromEntries(printable.map(i => [i.id, String(clampCopies(same))])))

  // The preview is the real size, shrunk to fit the dialog (a roll label is enlarged to be readable). Printing ignores it.
  const box = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(1)
  const pageMm = layout.kind === 'roll' ? layout.width : A4.width
  const hasProblem = !!problem
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => setFit((el.clientWidth - 28) / (pageMm * 96 / 25.4))
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [pageMm, hasProblem])
  const zoom = Math.max(0.2, Math.min(fit, layout.kind === 'roll' ? 2.5 : 1))
  const sheet = layout.kind === 'sheet'
  return (
    <Modal title={`Print labels${items.length ? ` · ${items.length}` : ''}`} onClose={onClose} wide>
      <div className="no-print label-controls">
        <p className="muted">Uses each product’s barcode, or its code when it has no barcode. Scanning a label always finds the product at its current price.</p>
        <fieldset className="label-layout">
          <legend>Label paper</legend>
          <label>Layout<select value={saved.preset} onChange={e => pick(e.target.value)}>
            {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            <option value={CUSTOM_ID}>Custom size…</option>
          </select></label>
          {sheet && <label>Start on label number<input type="number" min={1} max={labelsPerPage(layout)} value={start} onChange={e => setStart(e.target.value)} aria-describedby="start-hint" /><small id="start-hint" className="hint">For a sheet that is partly used. 1 is the top left.</small></label>}
          {saved.preset === CUSTOM_ID && <div className="label-custom">{FIELDS.filter(f => sheet || !f.sheetOnly).map(f => <label key={f.key}>{f.label}<input type="number" step="any" min={0} value={text[f.key]} onChange={e => edit(f.key, e.target.value)} /></label>)}
            <label>Paper<select value={saved.custom.kind} onChange={e => { const kind = e.target.value as Layout['kind']; setText(t => ({ ...t })); choose({ custom: { ...custom, kind } }) }}><option value="sheet">A4 sheet</option><option value="roll">Roll</option></select></label></div>}
          <div className="label-options">
            <label className="check inline"><input type="checkbox" checked={saved.options.price} onChange={e => choose({ options: { ...saved.options, price: e.target.checked } })} />Print the price</label>
            <label className="check inline"><input type="checkbox" checked={saved.options.shop} onChange={e => choose({ options: { ...saved.options, shop: e.target.checked } })} />Print the shop name</label>
          </div>
          {saved.options.price && <p className="muted hint">A printed price goes out of date when you change the price. Reprint the label then; scanning still uses the current price.</p>}
        </fieldset>
        {problem && <Alert>{problem}</Alert>}

        {loading && <Loading />}
        {failed && <Alert>Labels could not be loaded. <button className="link" onClick={() => void labels.refetch()}>Retry labels</button></Alert>}
        {unusable.length > 0 && <Alert kind="info">{unusable.length} product{unusable.length === 1 ? ' has' : 's have'} no usable barcode or code, so no label can be made: {unusable.slice(0, 5).map(u => u.name).join(', ')}{unusable.length > 5 ? ` and ${unusable.length - 5} more` : ''}. Close this, find them with “No barcode or code”, and choose Assign codes.</Alert>}
        {printable.length > 0 && !testing && <details className="label-copies">
          <summary>Copies of each label ({total.toLocaleString('en-IN')} in all)</summary>
          <div className="label-same"><label>Set every product to<input type="number" min={1} max={MAX_COPIES} value={same} onChange={e => setSame(e.target.value)} /></label><Button onClick={setAll}>Apply to all</Button></div>
          <ul className="plain label-copy-list">{printable.map(i => <li key={i.id} className="row"><span>{i.name} <small className="muted">{i.value}</small></span>
            <input type="number" min={1} max={MAX_COPIES} aria-label={`Copies of ${i.name}`} value={copies[i.id] ?? '1'} onChange={e => setCopies(c => ({ ...c, [i.id]: e.target.value }))} /></li>)}</ul>
        </details>}
        {tooMany && <Alert>That is {total.toLocaleString('en-IN')} labels. One print run takes up to {MAX_LABELS}: lower the copies or choose fewer products.</Alert>}

        <p className="label-count" role="status">{total.toLocaleString('en-IN')} label{total === 1 ? '' : 's'} on {pages.length} {layout.kind === 'roll' ? 'roll label' : 'sheet'}{pages.length === 1 ? '' : 's'}{testing ? ' (a test)' : ''}. Print at 100% scale, with no “fit to page”.</p>
        <div className="actions">
          <button className="primary" disabled={loading || failed || (printable.length === 0 && !testing) || !!problem || tooMany} onClick={() => window.print()}>{testing ? 'Print test label' : 'Print'}</button>
          <Button onClick={() => setTesting(t => !t)} disabled={!!problem}>{testing ? 'Back to my labels' : 'Preview a test label'}</Button>
          <Button onClick={onClose}>Close</Button>
        </div>
        {testing && <p className="muted hint">A test label prints one label so you can check it lines up and scans before printing a whole sheet.</p>}
      </div>
      {!problem && <div ref={box} className="label-sheet" aria-label="Label preview">
        <div className="label-zoom" style={{ zoom }}>
          {pages.map((cells, i) => <Page key={i} cells={cells} layout={layout} options={saved.options} shopName={shopName} />)}
        </div>
      </div>}
    </Modal>
  )
}
