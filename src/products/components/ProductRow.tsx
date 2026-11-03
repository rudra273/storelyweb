import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ApiError } from '../../api/client'
import { day } from '../../components/labels'
import { NavIcon } from '../../components/layout/NavIcon'
import { describeError } from '../../components/useAction'
import { formatMoney, formatQty, isAmount } from '../../lib/money'
import { useShop } from '../../shops/context'
import { saveProduct, useProductMutation, type Category, type Product } from '../queries'

type Mode = 'view' | 'edit' | 'review' | 'saving'
type Draft = { name: string; category: string; price: string; reorder: string }

const sameNumber = (a: string, b: string | null | undefined) => (a.trim() === '' && !b) || (a.trim() !== '' && b != null && Number(a) === Number(b))

/**
 * One catalogue row. Nothing in it can be typed into until its edit icon is clicked; then name,
 * category, a fixed price and the reorder level become fields and that same button turns into Save.
 * Stock is never a field: it changes only through the ledger. The full form is in the product's details.
 */
export function ProductRow({ p, selected, picked, pickLocked, canEdit, seeCost, categories, onPick, onOpen, onRestock, onPrintLabel }: {
  p: Product
  selected: boolean
  picked: boolean
  /** True while "all matching products" is selected: rows follow it until it is cleared. */
  pickLocked: boolean
  canEdit: boolean
  seeCost: boolean
  categories: Category[]
  onPick: () => void
  onOpen: () => void
  /** Opens the purchase composer with this product filled in (low and out-of-stock rows). */
  onRestock: () => void
  /** Opens label printing for this product (offered after its price changes). */
  onPrintLabel: () => void
}) {
  const shop = useShop().current?.shop_id ?? ''
  const client = useQueryClient()
  const save = useProductMutation(saveProduct)
  const [mode, setMode] = useState<Mode>('view')
  const [draft, setDraft] = useState<Draft>({ name: '', category: '', price: '', reorder: '' })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // After a price change, printed price labels are out of date: offer the reprint until the row is edited again.
  const [priceChanged, setPriceChanged] = useState(false)
  const nameField = useRef<HTMLInputElement>(null)
  const saveButton = useRef<HTMLButtonElement>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const fixed = p.price_mode === 'fixed'
  const tracked = p.track_stock
  const editing = mode !== 'view'
  const cost = p.purchase_price

  // Keyboard focus follows the step: the name field to start, the Confirm button when the effect is shown.
  useEffect(() => {
    if (mode === 'edit') nameField.current?.focus()
    else if (mode === 'review') saveButton.current?.focus()
  }, [mode])

  function start() {
    setDraft({ name: p.name, category: p.category_uuid ?? '', price: p.selling_price ?? '', reorder: p.reorder_level ?? '' })
    setError(null)
    setSaved(false)
    setPriceChanged(false)
    setMode('edit')
  }
  function stop() {
    setMode('view')
    setError(null)
    setTimeout(() => editButton.current?.focus(), 0)
  }
  const set = (key: keyof Draft) => (value: string) => setDraft(d => ({ ...d, [key]: value }))

  /** Only what was changed is sent. */
  function changes(): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    if (draft.name.trim() !== p.name) out.name = draft.name.trim()
    if (draft.category !== (p.category_uuid ?? '')) out.category_uuid = draft.category || null
    if (fixed && !sameNumber(draft.price, p.selling_price)) { out.price_mode = 'fixed'; out.selling_price = draft.price.trim() }
    if (tracked && !sameNumber(draft.reorder, p.reorder_level)) out.reorder_level = draft.reorder.trim() || null
    return out
  }
  function problem(): string | null {
    if (!draft.name.trim()) return 'A product needs a name.'
    if (fixed && !isAmount(draft.price)) return 'Enter the price, like 25 or 25.50.'
    if (tracked && draft.reorder.trim() !== '' && !isAmount(draft.reorder)) return 'Enter the reorder level as a quantity, like 5 or 2.5.'
    return null
  }

  async function commit(body: Record<string, unknown>) {
    setMode('saving')
    try {
      // The token is the version this row showed; if someone changed the product since, the server refuses.
      await save.mutateAsync({ id: p.uuid, body: { ...body, expected_updated_at: p.updated_at } })
      setMode('view')
      setSaved(true)
      setPriceChanged('selling_price' in body)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setSaved(false), 2500)
      setTimeout(() => editButton.current?.focus(), 0)
    } catch (e) {
      // Show what it says now; saving again is the deliberate choice to replace it.
      if (e instanceof ApiError && e.code === 'changed_elsewhere') void client.invalidateQueries({ queryKey: ['products', shop] })
      setError(describeError(e))
      setMode('edit')
    }
  }
  function submit() {
    if (mode === 'saving') return
    const bad = problem()
    if (bad) { setError(bad); setMode('edit'); return }
    const body = changes()
    if (Object.keys(body).length === 0) { stop(); return }
    setError(null)
    // A new price changes what customers pay: show that first, then ask once more.
    if ('selling_price' in body && mode === 'edit') { setMode('review'); return }
    void commit(body)
  }
  function keys(e: KeyboardEvent) {
    if (!editing || mode === 'saving') return
    if (e.key === 'Escape') { e.preventDefault(); if (mode === 'review') setMode('edit'); else stop() }
    else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); submit() }
  }

  const locked = mode !== 'edit'
  const reviewing = mode === 'review'
  const price = Number(draft.price)
  return <>
    <tr className={selected || editing ? 'selected' : undefined} onKeyDown={keys}>
      <td><input type="checkbox" aria-label={`Select ${p.name}`} checked={picked} disabled={pickLocked} title={pickLocked ? 'Clear the selection to choose products one by one' : undefined} onChange={onPick} /></td>
      <td>
        {editing
          ? <input ref={nameField} className="cell-input" aria-label={`Name of ${p.name}`} value={draft.name} maxLength={200} disabled={locked} onChange={e => set('name')(e.target.value)} aria-invalid={error && !draft.name.trim() ? true : undefined} />
          : <button className="link row-link" onClick={onOpen}>{p.name}</button>}
        <br />
        <small className="muted">{[p.product_code, p.barcode].filter(Boolean).join(' · ')}</small>
      </td>
      <td className="hide-sm">{editing
        ? <select className="cell-input" aria-label={`Category of ${p.name}`} value={draft.category} disabled={locked} onChange={e => set('category')(e.target.value)}>
            <option value="">No category</option>
            {categories.map(c => <option key={c.uuid} value={c.uuid}>{c.name}</option>)}
          </select>
        : p.category_name ?? '—'}</td>
      <td>{editing && fixed
        ? <input className="cell-input cell-number" aria-label={`Price of ${p.name}`} inputMode="decimal" value={draft.price} disabled={locked} onChange={e => set('price')(e.target.value)} aria-invalid={error && !isAmount(draft.price) ? true : undefined} />
        : <>{formatMoney(p.selling_price)}{!fixed && <small className="muted"> from cost + margin</small>}</>}</td>
      {seeCost && <td className="hide-sm">{formatMoney(p.purchase_price)}</td>}
      <td>{tracked ? <>{formatQty(p.quantity)} {p.unit_name ?? ''} {p.low_stock && <span className="badge warn">low</span>}{canEdit && p.low_stock && !editing && <button type="button" className="link restock-link" aria-label={`Restock ${p.name}`} onClick={onRestock}>Restock</button>}</> : <span className="muted">not tracked</span>}</td>
      <td className="hide-sm">{editing && tracked
        ? <input className="cell-input cell-number" aria-label={`Reorder level of ${p.name}`} inputMode="decimal" value={draft.reorder} disabled={locked} onChange={e => set('reorder')(e.target.value)} aria-invalid={error && draft.reorder.trim() !== '' && !isAmount(draft.reorder) ? true : undefined} />
        : p.reorder_level ? formatQty(p.reorder_level) : '—'}</td>
      <td className="hide-sm">{p.next_expiry ? day(p.next_expiry) : '—'}</td>
      {canEdit && <td className="row-actions">
        {editing
          ? <span className="row-edit-actions">
              <button ref={saveButton} type="button" className="ui-button primary icon-button" disabled={mode === 'saving'} onClick={submit}><NavIcon name="check" className="button-icon" />{mode === 'saving' ? 'Saving…' : reviewing ? 'Confirm' : 'Save'}</button>
              <button type="button" className="ui-button icon-button" aria-label={reviewing ? 'Go back and keep editing' : `Cancel editing ${p.name}`} title={reviewing ? 'Back' : 'Cancel'} disabled={mode === 'saving'} onClick={() => reviewing ? setMode('edit') : stop()}><NavIcon name="close" className="button-icon" /></button>
            </span>
          : <>
              {saved && <span className="inline-saved" role="status">Saved</span>}
              {priceChanged && (p.barcode || p.product_code) && <button type="button" className="link reprint-link" aria-label={`Reprint the label for ${p.name}, its price changed`} title="Labels printed before show the old price" onClick={onPrintLabel}>Reprint label</button>}
              <button ref={editButton} type="button" className="ui-button icon-button" aria-label={`Edit ${p.name}`} title="Edit" onClick={start}><NavIcon name="edit" className="button-icon" /></button>
            </>}
      </td>}
    </tr>
    {(error || reviewing) && <tr className="row-note selected"><td colSpan={9}>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {reviewing && <p className="inline-review" role="status">{formatMoney(p.selling_price)} to <strong>{formatMoney(draft.price)}</strong>. New invoices use the new price; saved invoices keep theirs.{seeCost && cost && price < Number(cost) ? <> This is below your cost of {formatMoney(cost)}.</> : null}</p>}
    </td></tr>}
  </>
}
