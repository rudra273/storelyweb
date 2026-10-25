import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { Modal } from '../components/Modal'
import { Alert, Field, Loading } from '../components/ui'
import { useAction } from '../components/useAction'
import { useShop } from '../shops/context'
import { useCategories, useProductMutation, useUnits } from './queries'

type Kind = 'categories' | 'units'
interface Item { uuid: string; name: string; product_count?: number | null }

function Section({ kind, title, items, loading }: { kind: Kind; title: string; items: Item[] | undefined; loading: boolean }) {
  const { current } = useShop()
  const base = `/v1/shops/${current?.shop_id}/${kind}`
  const create = useProductMutation((_: string, name: string) => api.post(base, { name }))
  const rename = useProductMutation((_: string, v: { id: string; name: string }) => api.patch(`${base}/${v.id}`, { name: v.name }))
  const remove = useProductMutation((_: string, id: string) => api.delete(`${base}/${id}`))
  const { error, run, busy } = useAction()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)

  async function add(e: FormEvent) {
    e.preventDefault()
    if (await run(async () => { await create.mutateAsync(name.trim()); return true })) setName('')
  }

  return (
    <section>
      <h3>{title}</h3>
      {error && <Alert>{error}</Alert>}
      {loading && <Loading />}
      <ul className="plain">
        {items?.map((it) => (
          <li key={it.uuid} className="row">
            {editing?.id === it.uuid ? (
              <form
                className="inline-form"
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (await run(async () => { await rename.mutateAsync({ id: it.uuid, name: editing.name.trim() }); return true })) setEditing(null)
                }}
              >
                <input aria-label={`New name for ${it.name}`} value={editing.name} onChange={(e) => setEditing({ id: it.uuid, name: e.target.value })} autoFocus />
                <button className="primary" disabled={busy || !editing.name.trim()}>Save</button>
                <button type="button" onClick={() => setEditing(null)}>Cancel</button>
              </form>
            ) : (
              <>
                <span>
                  {it.name} <small className="muted">{it.product_count ? `${it.product_count} product${it.product_count === 1 ? '' : 's'}` : ''}</small>
                </span>
                <span>
                  <button className="link" onClick={() => setEditing({ id: it.uuid, name: it.name })}>Rename</button>
                  <button className="link danger" disabled={busy} onClick={() => void run(async () => { await remove.mutateAsync(it.uuid); return true })}>Delete</button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="inline-form" noValidate>
        <Field label={`New ${kind === 'units' ? 'unit' : 'category'}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        <button className="primary" disabled={busy || !name.trim()}>Add</button>
      </form>
    </section>
  )
}

export function ListsManager({ onClose }: { onClose: () => void }) {
  const categories = useCategories()
  const units = useUnits()
  return (
    <Modal title="Categories and units" onClose={onClose} wide>
      <div className="two-col">
        <Section kind="categories" title="Categories" items={categories.data} loading={categories.isPending} />
        <Section kind="units" title="Units" items={units.data} loading={units.isPending} />
      </div>
      <p className="muted">A category or unit that products still use cannot be deleted; move those products first.</p>
    </Modal>
  )
}
