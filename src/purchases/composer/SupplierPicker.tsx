import { useId, useState, type KeyboardEvent } from 'react'
import type { Supplier } from '../../products/queries'
import { receiptMoney } from './money'

const SHOWN = 6

/**
 * Find a supplier by name, phone or GSTIN, or add one without leaving the purchase.
 * Choosing a supplier shows what is already owed to them, so the payment decision is made knowing it.
 */
export function SupplierPicker({ suppliers, value, onChange, onCreate, loading }: {
  suppliers: Supplier[] | undefined
  value: string
  onChange: (uuid: string) => void
  onCreate: (name: string) => void
  loading: boolean
}) {
  const id = useId()
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const chosen = value ? suppliers?.find(s => s.uuid === value) : undefined
  const needle = text.trim().toLowerCase()
  const matches = (suppliers ?? [])
    .filter(s => !needle || [s.name, s.phone, s.gstin].some(v => v?.toLowerCase().includes(needle)))
    .slice(0, SHOWN)
  const exact = (suppliers ?? []).some(s => s.name.trim().toLowerCase() === needle)
  const canCreate = !!needle && !exact
  const count = matches.length + (canCreate ? 1 : 0)
  const pick = (uuid: string) => { onChange(uuid); setText(''); setOpen(false) }
  const create = () => { onCreate(text.trim()); setText(''); setOpen(false) }
  function key(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, count - 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (event.key === 'Escape') { setOpen(false); setText('') }
    else if (event.key === 'Enter' && open && count) {
      event.preventDefault()
      const match = matches[active]
      if (match) pick(match.uuid); else if (canCreate) create()
    }
  }
  if (value) {
    return <div className="field supplier-picker">
      <span className="field-label" id={`${id}-label`}>Supplier</span>
      <div className="supplier-chosen" role="group" aria-labelledby={`${id}-label`}>
        <span><strong>{chosen?.name ?? 'Saved supplier'}</strong>{chosen && Number(chosen.balance_due ?? '0') > 0 && <small className="muted"> · you owe {receiptMoney(chosen.balance_due ?? '0')}</small>}</span>
        <button type="button" className="link" onClick={() => onChange('')}>Change</button>
      </div>
    </div>
  }
  return <div className="field supplier-picker">
    <label htmlFor={id}>Supplier</label>
    <input id={id} role="combobox" aria-expanded={open && count > 0} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={open && count ? `${id}-opt-${active}` : undefined}
      autoComplete="off" placeholder={loading ? 'Loading suppliers…' : 'Search or add a supplier'} value={text}
      onChange={e => { setText(e.target.value); setActive(0); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={key} />
    {open && count > 0 && <ul className="supplier-options" role="listbox" id={`${id}-list`} aria-label="Suppliers">
      {matches.map((s, i) => <li key={s.uuid} id={`${id}-opt-${i}`} role="option" aria-selected={i === active} className={i === active ? 'active' : undefined} onMouseDown={e => { e.preventDefault(); pick(s.uuid) }}>
        {s.name}{Number(s.balance_due ?? '0') > 0 && <small className="muted"> · you owe {receiptMoney(s.balance_due ?? '0')}</small>}
      </li>)}
      {canCreate && <li id={`${id}-opt-${matches.length}`} role="option" aria-selected={active === matches.length} className={active === matches.length ? 'active add' : 'add'} onMouseDown={e => { e.preventDefault(); create() }}>Add “{text.trim()}” as a new supplier</li>}
    </ul>}
    <small className="hint">Optional. Needed to record what you owe.</small>
  </div>
}
