import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api, request } from '../api/client'
import type { components } from '../api/schema'
import { day, dayRange, paymentMethod } from '../components/labels'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/toastContext'
import { useFirstError } from '../components/useFirstError'
import { Alert, Empty, Field, Loading } from '../components/ui/ui'
import { describeError, useAction } from '../components/useAction'
import { PageHeader, Toolbar } from '../components/ui/workspace'
import { formatMoney } from '../lib/money'
import { useRetryKey } from '../lib/retryKey'
import { amountProblem, todayIso } from '../lib/validate'
import { useShop } from '../shops/context'
import './customers.css'
import { useDirtyClose, useIsDirty } from '../lib/dirty'
import { ACTION } from '../lib/vocabulary'

type S = components['schemas']
type Expense = S['ExpenseOut']
const METHODS = ['cash', 'upi', 'card', 'bank'] as const
const FIRST_DAY = '2020-01-01'

function monthRange(month: string): { start: string; end: string } {
  const [y = 0, m = 1] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  const end = `${month}-${String(last).padStart(2, '0')}`
  const today = todayIso()
  return { start: `${month}-01`, end: end > today ? today : end }
}

/** Money spent running the shop. Counted in Profit and loss; cash ones lower the day's cash. */
export function ExpensesPage() {
  // Keyed by shop so an open form or chosen filter never carries into another shop.
  return <ExpensesWorkspace key={useShop().current?.shop_id} />
}

function ExpensesWorkspace() {
  const shop = useShop().current?.shop_id ?? ''
  const base = `/v1/shops/${shop}`
  const [month, setMonth] = useState(todayIso().slice(0, 7))
  const [category, setCategory] = useState('')
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const range = monthRange(month)
  const params = new URLSearchParams(range)
  if (category) params.set('category', category)
  const query = useQuery({ queryKey: ['expenses', shop, params.toString()], queryFn: () => api.get<S['ExpensePage']>(`${base}/expenses?${params}`), enabled: !!shop && /^\d{4}-\d{2}$/.test(month) })
  const client = useQueryClient()
  const toast = useToast()
  const remove = useAction()
  const refresh = () => {
    for (const key of ['expenses', 'report']) void client.invalidateQueries({ queryKey: [key, shop] })
  }
  async function del(e: Expense) {
    if (!window.confirm(`Delete the ${formatMoney(e.amount)} ${e.category} expense of ${day(e.expense_date)}?`)) return
    if (await remove.run(async () => { await api.delete(`${base}/expenses/${e.uuid}`); return true })) {
      toast('Expense deleted')
      refresh()
    }
  }
  const categories = query.data?.categories ?? []
  return <div className="expenses-page">
    <PageHeader eyebrow="SHOP COSTS" title="Expenses" description="Rent, salaries, electricity and other running costs. They are taken off your profit in Profit and loss." actions={<button className="primary" onClick={() => setEditing('new')}>Add expense</button>} />
    <Toolbar label="Choose period" className="expense-filters">
      <Field label="Month" type="month" min={FIRST_DAY.slice(0, 7)} max={todayIso().slice(0, 7)} value={month} onChange={e => e.target.value && setMonth(e.target.value)} />
      <label>Category<select value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
    </Toolbar>
    {remove.error && <Alert>{remove.error}</Alert>}
    {query.isPending && <Loading />}
    {query.error && <Alert>{describeError(query.error)} <button className="link" onClick={() => void query.refetch()}>Retry</button></Alert>}
    {query.data && <>
      <div className="customer-summary" aria-label="Totals for this period">
        <div><span className="muted">Spent {month === todayIso().slice(0, 7) ? 'this month so far' : 'in this month'}</span><strong>{formatMoney(query.data.total)}</strong><small className="muted">{dayRange(range.start, range.end)}</small></div>
        <div><span className="muted">Paid in cash</span><strong>{formatMoney(query.data.cash_total)}</strong><small className="muted">Lowers the day's closing cash</small></div>
        {query.data.by_category.slice(0, 3).map(c => <div key={c.category}><span className="muted">{c.category}</span><strong>{formatMoney(c.amount)}</strong></div>)}
      </div>
      {query.data.items.length ? <div className="table-wrap"><table className="table expense-table"><thead><tr><th className="hide-sm">Date</th><th>Category</th><th className="hide-sm">Notes</th><th className="hide-sm">Paid by</th><th className="num">Amount</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {query.data.items.map(e => <tr key={e.uuid}><td className="nowrap hide-sm">{day(e.expense_date)}</td><td>{e.category}<small className="show-sm muted">{day(e.expense_date)}</small></td><td className="hide-sm">{e.notes || <span className="muted">—</span>}</td><td className="hide-sm">{paymentMethod(e.payment_method)}</td><td className="num">{formatMoney(e.amount)}</td>
          <td className="row-actions"><button className="link" onClick={() => setEditing(e)}>Edit</button><button className="link danger-link" disabled={remove.busy} onClick={() => void del(e)}>Delete</button></td></tr>)}
      </tbody></table>{query.data.has_more && <p className="muted">Showing the latest {query.data.items.length} of {query.data.count} expenses. The totals above include all {query.data.count}. Narrow the month or category to see the rest.</p>}</div> : <Empty title={category ? `No ${category} expenses in this period` : 'No expenses in this period'}>Add rent, salaries, bills and other costs to see your real profit.</Empty>}
    </>}
    {editing && <ExpenseForm current={editing === 'new' ? undefined : editing} categories={categories} close={() => setEditing(null)} saved={() => { setEditing(null); refresh() }} />}
  </div>
}

type Draft = { amount: string; expense_date: string; category: string; payment_method: (typeof METHODS)[number]; notes: string }

function ExpenseForm({ current, categories, close, saved }: { current?: Expense; categories: string[]; close: () => void; saved: () => void }) {
  const shop = useShop().current?.shop_id ?? ''
  const toast = useToast()
  const action = useAction()
  const retryKey = useRetryKey()
  const { ref: formRef, focusFirstError } = useFirstError()
  const [draft, setDraft] = useState<Draft>(() => ({
    amount: current?.amount ?? '', expense_date: current?.expense_date.slice(0, 10) ?? todayIso(),
    category: current?.category ?? 'Other', payment_method: (METHODS as readonly string[]).includes(current?.payment_method ?? '') ? current!.payment_method as Draft['payment_method'] : 'cash',
    notes: current?.notes ?? '',
  }))
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({})
  const leave = useDirtyClose(useIsDirty(draft), close)
  const options = categories.includes(draft.category) ? categories : [...categories, draft.category]
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft({ ...draft, [k]: v })
    if (errors[k]) setErrors({ ...errors, [k]: undefined })
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    const found: Partial<Record<keyof Draft, string>> = {}
    const amount = amountProblem(draft.amount)
    if (amount) found.amount = amount
    if (!draft.expense_date) found.expense_date = 'Choose the date.'
    else if (draft.expense_date > todayIso()) found.expense_date = 'An expense date cannot be in the future.'
    else if (draft.expense_date < FIRST_DAY) found.expense_date = 'Choose a date from 2020 onwards.'
    setErrors(found)
    if (Object.keys(found).length) {
      focusFirstError()
      return
    }
    const body = { ...draft, amount: draft.amount.trim(), notes: draft.notes.trim() || null }
    const ok = await action.run(async () => {
      if (current) await api.patch(`/v1/shops/${shop}/expenses/${current.uuid}`, body)
      else await request('POST', `/v1/shops/${shop}/expenses`, { body, idempotencyKey: retryKey(body) })
      return true
    })
    if (ok) {
      toast(current ? 'Expense saved' : 'Expense added')
      saved()
    }
  }
  const err = (k: keyof Draft) => errors[k] ?? action.fieldErrors[k]
  return <Modal title={current ? 'Edit expense' : 'Add expense'} onClose={leave} canClose={!action.busy}>
    <form ref={formRef} onSubmit={submit} noValidate><fieldset disabled={action.busy}>
      <p className="muted form-legend">Fields marked <span className="required-mark" aria-hidden="true">*</span> are required.</p>
      <Field label="Amount (₹)" required inputMode="decimal" autoFocus placeholder="0.00" value={draft.amount} onChange={e => set('amount', e.target.value)} error={err('amount')} />
      <Field label="Date" required type="date" min={FIRST_DAY} max={todayIso()} value={draft.expense_date} onChange={e => set('expense_date', e.target.value)} error={err('expense_date')} />
      <label>Category<select value={draft.category} onChange={e => set('category', e.target.value)}>{options.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Paid by<select value={draft.payment_method} onChange={e => set('payment_method', e.target.value as Draft['payment_method'])}>{METHODS.map(m => <option key={m} value={m}>{paymentMethod(m)}</option>)}</select></label>
      <label className="field-block">Notes<textarea rows={2} maxLength={300} placeholder="What it was for" value={draft.notes} onChange={e => set('notes', e.target.value)} /></label>
    </fieldset>
    {action.error && <Alert>{action.error}</Alert>}
    <div className="actions"><button className="primary" disabled={action.busy}>{action.busy ? 'Saving…' : current ? ACTION.saveChanges : 'Add expense'}</button><button type="button" onClick={leave} disabled={action.busy}>Cancel</button></div>
    </form>
  </Modal>
}
