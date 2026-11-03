import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Alert, Field } from '../../components/ui/ui'
import { Button } from '../../components/ui/workspace'
import { useAction } from '../../components/useAction'
import { formatMoney } from '../../lib/money'
import { useRetryKey } from '../../lib/retryKey'
import { useShop } from '../../shops/context'
import { applyBulk, reviewBulk, useProductMutation, type BulkAction, type BulkResult, type BulkScope, type Category } from '../queries'

export type BulkKind = 'category' | 'reorder' | 'price' | 'archive' | 'codes'

const TITLE: Record<BulkKind, string> = { category: 'Change category', reorder: 'Set reorder level', price: 'Change prices', archive: 'Archive products', codes: 'Assign codes' }
const SHOWN = 8

const products = (n: number) => `${n.toLocaleString('en-IN')} product${n === 1 ? '' : 's'}`

function csv(skipped: BulkResult['skipped']): string {
  const cell = (v: string | null) => `"${(v ?? '').replace(/"/g, '""')}"`
  return ['Product,Reason', ...skipped.map(s => `${cell(s.name)},${cell(s.reason)}`)].join('\n')
}

/** The sample's before/after values are the server's own text; money ones are shown as rupees. */
const value = (kind: BulkKind, v: string) => (kind === 'price' ? formatMoney(v) : v)

/**
 * One change to many products, in three steps: say what to change, read what the server says
 * would happen (what changes, what stays, and what is left alone and why), then confirm.
 * Nothing is written until the last step, and what is written is exactly what was reviewed.
 */
export function BulkDialog({ kind, scope, count, categories, onClose, onApplied }: {
  kind: BulkKind
  scope: BulkScope
  count: number
  categories: Category[]
  onClose: () => void
  onApplied: () => void
}) {
  const shop = useShop().current?.shop_id ?? ''
  const retryKey = useRetryKey()
  const apply = useProductMutation((s: string, input: Parameters<typeof applyBulk>[1]) => applyBulk(s, input))
  const { busy, error, run, setError } = useAction()
  const [category, setCategory] = useState('')
  const [reorder, setReorder] = useState('')
  const [mode, setMode] = useState<'percent' | 'amount'>('percent')
  const [amount, setAmount] = useState('')
  const [review, setReview] = useState<BulkResult | null>(null)
  const [done, setDone] = useState<BulkResult | null>(null)

  function action(): BulkAction | string {
    if (kind === 'category') return { type: 'set_category', category_uuid: category || null }
    if (kind === 'archive') return { type: 'archive' }
    if (kind === 'codes') return { type: 'assign_codes' }
    if (kind === 'reorder') {
      if (reorder.trim() !== '' && !/^\d{1,9}(\.\d{1,4})?$/.test(reorder.trim())) return 'Enter the reorder level as a quantity, like 5 or 2.5, or leave it empty to remove it.'
      return { type: 'set_reorder_level', value: reorder.trim() === '' ? null : reorder.trim() }
    }
    if (!/^-?\d{1,9}(\.\d{1,2})?$/.test(amount.trim())) return 'Enter the change as a number, like 10 or -5.'
    if (mode === 'percent' && Number(amount) <= -100) return 'A price cannot fall by 100% or more.'
    return { type: 'price_change', mode, value: amount.trim() }
  }

  async function check(e: FormEvent) {
    e.preventDefault()
    const a = action()
    if (typeof a === 'string') { setError(a); return }
    const result = await run(() => reviewBulk(shop, { scope, action: a }))
    if (result) setReview(result)
  }
  async function confirm() {
    const a = action()
    if (typeof a === 'string' || !review) return
    const result = await run(() => apply.mutateAsync({ scope, action: a, review, key: retryKey({ scope, action: a, f: review.fingerprint }) }))
    if (result) { setDone(result); onApplied() }
  }
  function download(list: BulkResult['skipped']) {
    const url = URL.createObjectURL(new Blob([csv(list)], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'products-left-alone.csv'
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const result = done ?? review
  const final: Record<BulkKind, (n: number) => string> = {
    category: n => `Change category of ${products(n)}`,
    reorder: n => `Set reorder level of ${products(n)}`,
    price: n => `Change prices of ${products(n)}`,
    archive: n => `Archive ${products(n)}`,
    codes: n => `Give codes to ${products(n)}`,
  }
  return <Modal title={`${TITLE[kind]} · ${products(count)}`} onClose={onClose} canClose={!busy} wide>
    {!result && <form onSubmit={check} noValidate aria-busy={busy}>
      <fieldset disabled={busy}>
        {kind === 'category' && <label>New category<select value={category} onChange={e => setCategory(e.target.value)} autoFocus>
          <option value="">No category</option>
          {categories.map(c => <option key={c.uuid} value={c.uuid}>{c.name}</option>)}
        </select></label>}
        {kind === 'reorder' && <Field label="Reorder level" inputMode="decimal" value={reorder} onChange={e => setReorder(e.target.value)} hint="Stock at or below this shows as low. Leave empty to remove it." autoFocus />}
        {kind === 'price' && <>
          <Field label={mode === 'percent' ? 'Change by (%)' : 'Change by (₹)'} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} hint="Use a minus sign to lower prices, like -5. Only fixed-price products change; others are listed as left alone." autoFocus />
          <div role="radiogroup" aria-label="How to change prices" className="radio-row">
            <label className="check inline"><input type="radio" name="mode" checked={mode === 'percent'} onChange={() => setMode('percent')} />Percent</label>
            <label className="check inline"><input type="radio" name="mode" checked={mode === 'amount'} onChange={() => setMode('amount')} />Rupees</label>
          </div>
        </>}
        {kind === 'codes' && <p>Each chosen product that has no barcode and no code gets a code of its own, so it can be scanned and its label printed. Products that already have either are left as they are.</p>}
        {kind === 'archive' && <p>Archived products leave the catalogue and the phone's product list. Past invoices keep them. Products that still have stock are left alone.</p>}
      </fieldset>
      {error && <Alert>{error}</Alert>}
      <div className="actions"><Button onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Checking…' : 'Review change'}</Button></div>
    </form>}

    {result && <div aria-busy={busy}>
      <h3 className="bulk-heading">{done ? (done.replayed ? 'This change was already applied' : 'Done') : 'What will happen'}</h3>
      <dl className="bulk-summary" role="group" aria-label="Summary">
        <div><dt>{done ? 'Changed' : 'Will change'}</dt><dd>{result.will_change.toLocaleString('en-IN')}</dd></div>
        <div><dt>Already the same</dt><dd>{result.unchanged.toLocaleString('en-IN')}</dd></div>
        <div><dt>Left alone</dt><dd>{(result.skipped_total + result.missing).toLocaleString('en-IN')}</dd></div>
      </dl>
      {result.sample.length > 0 && <table className="table bulk-sample"><caption>{done ? 'For example' : 'For example, the first few'}</caption><thead><tr><th>Product</th><th className="num">Now</th><th className="num">After</th></tr></thead>
        <tbody>{result.sample.map(r => <tr key={r.uuid}><td>{r.name}</td><td className="num">{value(kind, r.before)}</td><td className="num">{value(kind, r.after)}</td></tr>)}</tbody></table>}
      {result.notes.map(n => <p key={n} className="muted">{n}</p>)}
      {result.below_cost ? <Alert kind="info">{result.below_cost} of the new prices are below cost. You can still go ahead.</Alert> : null}
      {result.skipped_total > 0 && <section aria-label="Left alone">
        <h4>Left alone, and why</h4>
        <ul className="plain bulk-skipped">{result.skipped.slice(0, SHOWN).map(s => <li key={s.uuid}><strong>{s.name}</strong> <span className="muted">{s.reason}</span></li>)}</ul>
        {result.skipped_total > SHOWN && <p className="muted">and {result.skipped_total - SHOWN} more.</p>}
        <button type="button" className="link" onClick={() => download(result.skipped)}>Download the full list (CSV)</button>
      </section>}
      {result.missing > 0 && <p className="muted">{result.missing} of the chosen products no longer exist and were skipped.</p>}
      {error && <Alert>{error}{error.includes('changed since') && <> <button type="button" className="link" onClick={() => { setReview(null); setError(null) }}>Review again</button></>}</Alert>}
      <div className="actions sticky-actions">
        {done ? <Button variant="primary" onClick={onClose}>Close</Button> : <>
          <Button onClick={() => { setReview(null); setError(null) }} disabled={busy}>Back</Button>
          <Button variant={kind === 'archive' ? 'danger' : 'primary'} disabled={busy || result.will_change === 0} onClick={() => void confirm()}>{busy ? 'Saving…' : result.will_change === 0 ? 'Nothing to change' : final[kind](result.will_change)}</Button>
        </>}
      </div>
    </div>}
  </Modal>
}
