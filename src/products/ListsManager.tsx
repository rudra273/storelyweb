import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { Modal } from '../components/Modal'
import { Alert, Field, Loading } from '../components/ui'
import { useAction } from '../components/useAction'
import { useShop } from '../shops/context'
import { GST_RATES, useCategories, useProductMutation, useUnits } from './queries'

type Kind = 'categories' | 'units'
interface Item { uuid: string; name: string; product_count?: number | null; gst_percent?: string | null }

function Section({ kind, title, items, loading, blocked, onBusyChange }: { kind: Kind; title: string; items: Item[] | undefined; loading: boolean; blocked: boolean; onBusyChange: (kind: Kind, busy: boolean) => void }) {
  const { current } = useShop()
  const base = `/v1/shops/${current?.shop_id}/${kind}`
  const withGst = kind === 'categories'
  // Units have only a name; a category may also carry a GST rate for its products.
  const create = useProductMutation((_: string, v: { name: string; gst: string }) => api.post(base, withGst ? { name: v.name, gst_percent: v.gst || null } : { name: v.name }))
  const rename = useProductMutation((_: string, v: { id: string; name: string; gst: string }) => api.patch(`${base}/${v.id}`, withGst ? { name: v.name, gst_percent: v.gst || null } : { name: v.name }))
  const remove = useProductMutation((_: string, id: string) => api.delete(`${base}/${id}`))
  const { error, run, busy } = useAction()
  useEffect(() => onBusyChange(kind, busy), [kind, busy, onBusyChange])
  const [name, setName] = useState('')
  const [gst, setGst] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string; gst: string } | null>(null)
  const gstSelect = (value: string, onChange: (value: string) => void, label: string) => <select aria-label={label} value={value} onChange={e => onChange(e.target.value)}><option value="">GST not set</option>{GST_RATES.map(g => <option key={g} value={g}>GST {g}%</option>)}</select>

  async function add(e: FormEvent) {
    e.preventDefault()
    if (await run(async () => { await create.mutateAsync({ name: name.trim(), gst }); return true })) { setName(''); setGst('') }
  }

  return (
    <section>
      <h3>{title}</h3>
      {error && <Alert>{error}</Alert>}
      {loading && <Loading />}
      <fieldset disabled={busy || blocked}><ul className="plain">
        {items?.map((it) => (
          <li key={it.uuid} className="row">
            {editing?.id === it.uuid ? (
              <form
                className="inline-form"
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (await run(async () => { await rename.mutateAsync({ id: it.uuid, name: editing.name.trim(), gst: editing.gst }); return true })) setEditing(null)
                }}
              >
                <input aria-label={`New name for ${it.name}`} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
                {withGst && gstSelect(editing.gst, value => setEditing({ ...editing, gst: value }), `GST for ${it.name}`)}
                <button className="primary" disabled={busy || !editing.name.trim()}>Save</button>
                <button type="button" onClick={() => setEditing(null)}>Cancel</button>
              </form>
            ) : (
              <>
                <span>
                  {it.name} {withGst && it.gst_percent !== null && it.gst_percent !== undefined && <span className="badge">GST {it.gst_percent}%</span>} <small className="muted">{it.product_count ? `${it.product_count} product${it.product_count === 1 ? '' : 's'}` : ''}</small>
                </span>
                <span>
                  <button className="link" onClick={() => setEditing({ id: it.uuid, name: it.name, gst: it.gst_percent ?? '' })}>{withGst ? 'Edit' : 'Rename'}</button>
                  <button className="link danger" disabled={busy} onClick={() => void run(async () => { await remove.mutateAsync(it.uuid); return true })}>Delete</button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="inline-form" noValidate>
        <Field label={`New ${kind === 'units' ? 'unit' : 'category'}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        {withGst && gstSelect(gst, setGst, 'GST for the new category')}
        <button className="primary" disabled={busy || !name.trim()}>Add</button>
      </form></fieldset>
    </section>
  )
}

export function ListsManager({ onClose }: { onClose: () => void }) {
  const [pending, setPending] = useState<ReadonlySet<Kind>>(new Set())
  const reportBusy = useCallback((kind: Kind, busy: boolean) => setPending(previous => {
    if (previous.has(kind) === busy) return previous
    const next = new Set(previous)
    if (busy) next.add(kind)
    else next.delete(kind)
    return next
  }), [])
  const categories = useCategories()
  const units = useUnits()
  return (
    <Modal title="Categories and units" onClose={onClose} canClose={pending.size === 0} wide>
      {categories.error && <Alert>Categories could not be loaded. <button className="link" onClick={() => void categories.refetch()}>Retry categories</button></Alert>}
      {units.error && <Alert>Units could not be loaded. <button className="link" onClick={() => void units.refetch()}>Retry units</button></Alert>}
      <div className="two-col">
        <Section kind="categories" title="Categories" items={categories.data} loading={categories.isPending} blocked={pending.size > 0} onBusyChange={reportBusy} />
        <Section kind="units" title="Units" items={units.data} loading={units.isPending} blocked={pending.size > 0} onBusyChange={reportBusy} />
      </div>
      <p className="muted">A category or unit that products still use cannot be deleted; move those products first.</p>
    </Modal>
  )
}
