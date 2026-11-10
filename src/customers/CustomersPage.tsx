import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError, api, request } from '../api/client'
import type { components } from '../api/schema'
import { day, paymentMethod, paymentStatus } from '../components/labels'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/toastContext'
import { useFirstError } from '../components/useFirstError'
import { Alert, Empty, Field, Loading } from '../components/ui/ui'
import { describeError, useAction } from '../components/useAction'
import { PageHeader, Toolbar } from '../components/ui/workspace'
import { downloadFile } from '../lib/download'
import { formatMoney } from '../lib/money'
import { STATE_OPTIONS, stateLabel } from '../lib/states'
import { useDebounced } from '../lib/useDebounced'
import { amountProblem, emailProblem, gstinProblem, phoneLabel, phoneProblem } from '../lib/validate'
import { useShop } from '../shops/context'
import './customers.css'
import { useDirtyClose, useIsDirty } from '../lib/dirty'
import { ACTION } from '../lib/vocabulary'

type S = components['schemas']
type Row = S['CustomerRow']
type Detail = S['CustomerDetail']
const PAGE = 50
const HISTORY_PAGE = 200

function useCustomersBase() {
  const shop = useShop().current?.shop_id ?? ''
  return { shop, base: `/v1/shops/${shop}` }
}

/** Customers come from bills with a phone number, or are added here. Most owed first. */
export function CustomersPage() {
  const { id } = useParams()
  const shop = useShop().current?.shop_id
  // Keyed by shop so an open form or half-typed search never carries into another shop.
  return id ? <CustomerDetailPage key={`${shop}/${id}`} id={id} /> : <CustomerList key={shop} />
}

function CustomerList() {
  const { shop, base } = useCustomersBase()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 250)
  const [owing, setOwing] = useState(false)
  const [page, setPage] = useState(0)
  const [adding, setAdding] = useState(false)
  const params = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE), owing: String(owing) })
  if (q) params.set('q', q)
  const query = useQuery({ queryKey: ['customers', shop, 'accounts', params.toString()], queryFn: () => api.get<S['CustomerPage']>(`${base}/customers/accounts?${params}`), enabled: !!shop })
  const filtered = !!q || owing
  return <div className="customers-page">
    <PageHeader eyebrow="CUSTOMER ACCOUNTS" title="Customers" description="See who owes you money, their bills and payments. Customers are added when a bill has a phone number." actions={<button className="primary" onClick={() => setAdding(true)}>Add customer</button>} />
    {query.data && <div className="customer-summary" aria-label="Money owed to you">
      <div><span className="muted">Due on customer accounts</span><strong>{formatMoney(query.data.total_due)}</strong></div>
      <div><span className="muted">Customers who owe</span><strong>{query.data.owing_customers}</strong></div>
      {query.data.unassigned_bills !== undefined && <div>
        <span className="muted">Unassigned balances</span>
        <strong>{formatMoney(query.data.unassigned_due)}</strong>
        {query.data.unassigned_bills > 0 && <Link to="/billing?unassigned_credit=1">View {query.data.unassigned_bills} {query.data.unassigned_bills === 1 ? 'invoice' : 'invoices'}</Link>}
      </div>}
    </div>}
    <Toolbar label="Find customers" className="customer-filters" onChange={() => setPage(0)}>
      <Field label="Search" type="search" placeholder="Name, phone or GSTIN" maxLength={60} value={search} onChange={e => setSearch(e.target.value)} />
      <label className="check inline"><input type="checkbox" checked={owing} onChange={e => setOwing(e.target.checked)} />Only customers who owe</label>
    </Toolbar>
    {query.isPending && <Loading />}
    {query.error && <Alert>{describeError(query.error)} <button className="link" onClick={() => void query.refetch()}>Retry</button></Alert>}
    {query.data && <>
      {query.data.items.length ? <div className="table-wrap"><table className="table customer-table"><thead><tr><th>Customer</th><th className="hide-sm">Bills</th><th className="hide-sm">Bought</th><th className="hide-sm">Last bill</th><th>Due</th></tr></thead><tbody>
        {query.data.items.map(c => <tr key={c.uuid}>
          <td><Link to={`/customers/${c.uuid}`}>{c.name}</Link><br /><small className="muted">{phoneLabel(c.phone)}</small></td>
          <td className="hide-sm">{c.bill_count}</td>
          <td className="hide-sm">{formatMoney(c.total_purchase_amount)}</td>
          <td className="hide-sm">{c.last_purchase_at ? day(c.last_purchase_at) : '—'}</td>
          <td>{Number(c.due) > 0 ? <span className="due-amount">{formatMoney(c.due)}<small className="muted"> · {c.due_bills} {c.due_bills === 1 ? 'bill' : 'bills'}</small></span> : <span className="muted">Nothing due</span>}</td>
        </tr>)}
      </tbody></table></div> : filtered
        ? <Empty title="No customers match">Change the search or show everyone.</Empty>
        : <Empty title="No customers yet">Add a phone number when you make a bill, or add a customer here.</Empty>}
      {(page > 0 || query.data.has_more) && <div className="pager"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button disabled={!query.data.has_more} onClick={() => setPage(page + 1)}>Next</button></div>}
    </>}
    {adding && <CustomerForm close={() => setAdding(false)} saved={d => { setAdding(false); void navigate(`/customers/${d.customer.uuid}`) }} />}
  </div>
}

function CustomerDetailPage({ id }: { id: string }) {
  const { shop, base } = useCustomersBase()
  const path = `${base}/customers/${encodeURIComponent(id)}`
  const [billPage, setBillPage] = useState(0)
  const [paymentPage, setPaymentPage] = useState(0)
  const params = new URLSearchParams()
  if (billPage) params.set('bills_offset', String(billPage * HISTORY_PAGE))
  if (paymentPage) params.set('payments_offset', String(paymentPage * HISTORY_PAGE))
  const detailKey = ['customers', shop, 'detail', id]
  const query = useQuery({
    queryKey: [...detailKey, billPage, paymentPage],
    queryFn: () => api.get<Detail>(params.size ? `${path}?${params}` : path),
    enabled: !!shop,
    placeholderData: keepPreviousData,
  })
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)
  const download = useAction()
  const client = useQueryClient()
  const update = (d: Detail) => {
    setBillPage(0)
    setPaymentPage(0)
    void client.invalidateQueries({ queryKey: detailKey, refetchType: 'none' })
    client.setQueryData([...detailKey, 0, 0], d)
    void client.invalidateQueries({ queryKey: ['customers', shop, 'accounts'] })
  }
  return <div className="customers-page">
    <Link to="/customers">Back to customers</Link>
    {query.isPending && <Loading />}
    {query.error && <Alert>{describeError(query.error)} <button className="link" onClick={() => void query.refetch()}>Retry</button>
      {!!(billPage || paymentPage) && <button className="link" onClick={() => { setBillPage(0); setPaymentPage(0) }}>Back to first pages</button>}
    </Alert>}
    {query.data && (() => {
      const { customer: c, bills, payments, bills_has_more, payments_has_more } = query.data
      const owes = Number(c.due) > 0
      return <>
        <PageHeader eyebrow="CUSTOMER" title={c.name} description={[phoneLabel(c.phone), c.gstin].filter(Boolean).join(' · ')} actions={<>
          {owes && <button className="primary" onClick={() => setPaying(true)}>Record payment</button>}
          <button disabled={download.busy} onClick={() => void download.run(() => downloadFile(`${path}/statement.csv`, 'customer-statement.csv'))}>{download.busy ? 'Downloading…' : 'Download statement'}</button>
          <button onClick={() => setEditing(true)}>Edit details</button>
        </>} />
        {download.error && <Alert>{download.error}</Alert>}
        <div className="customer-summary">
          <div><span className="muted">Due</span><strong className={owes ? 'due-amount' : undefined}>{formatMoney(c.due)}</strong>{owes && <small className="muted">on {c.due_bills} {c.due_bills === 1 ? 'bill' : 'bills'}</small>}</div>
          <div><span className="muted">Net billed after credit notes</span><strong>{formatMoney(c.total_purchase_amount)}</strong><small className="muted">{c.bill_count} {c.bill_count === 1 ? 'invoice' : 'invoices'}</small></div>
          <div><span className="muted">Last bill</span><strong>{c.last_purchase_at ? day(c.last_purchase_at) : '—'}</strong></div>
        </div>
        <div className="customer-grid">
          <section className="card" aria-busy={query.isPlaceholderData}><h2>Bills</h2>
            {bills.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Bill</th><th>Status</th><th>Total</th><th>Due</th></tr></thead><tbody>
              {bills.map(b => {
                const credit = b.document_type === 'credit_note'
                const status = b.cancelled ? 'Voided' : credit ? 'Credit note' : paymentStatus(b.payment_status ?? 'unpaid')
                return <tr key={b.uuid}>
                  <td><Link to={`/billing/${b.uuid}`}>{b.bill_number}</Link><br /><small className="muted">{day(b.created_at)}</small></td>
                  <td><span className={`payment-badge ${b.cancelled ? 'cancelled' : credit ? 'credit' : b.payment_status ?? ''}`}>{status}</span></td>
                  <td>{formatMoney(b.total_amount)}</td><td>{b.cancelled || credit ? '—' : formatMoney(b.balance_due)}</td>
                </tr>
              })}
            </tbody></table></div> : <p className="muted">No bills yet.</p>}
            <HistoryPager label="bills" page={billPage} more={bills_has_more} loading={query.isPlaceholderData} setPage={setBillPage} />
          </section>
          <div className="customer-side">
            <section className="card" aria-busy={query.isPlaceholderData}><h2>Payment entries</h2>
              {payments.length ? <ul className="plain">{payments.map(p => <li className="row" key={p.uuid}><span>{day(p.received_at)} · {paymentMethod(p.payment_method)}<br /><small className="muted"><Link to={`/billing/${p.bill_uuid}`}>{p.bill_number}</Link>{p.payment_reference && ` · ${p.payment_reference}`}</small></span><strong>{formatMoney(p.amount)}</strong></li>)}</ul> : <p className="muted">No payments yet.</p>}
              <HistoryPager label="payment entries" page={paymentPage} more={payments_has_more} loading={query.isPlaceholderData} setPage={setPaymentPage} />
            </section>
            <section className="card"><h2>Details</h2><dl className="customer-facts">
              {([['Phone', phoneLabel(c.phone)], ['Email', c.email], ['GSTIN', c.gstin], ['Legal name', c.gst_legal_name], ['Trade name', c.gst_trade_name], ['Place of supply', stateLabel(c.place_of_supply_state_code)], ['Address', c.address], ['Notes', c.notes]] as [string, string | null][]).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}
            </dl></section>
          </div>
        </div>
        {editing && <CustomerForm current={c} close={() => setEditing(false)} saved={d => { setEditing(false); update(d) }} />}
        {paying && <SettleDialog customer={c} close={() => setPaying(false)} saved={d => {
          update(d)
          for (const key of ['bills', 'bill', 'report']) void client.invalidateQueries({ queryKey: [key, shop] })
        }} />}
      </>
    })()}
  </div>
}

function HistoryPager({ label, page, more, loading, setPage }: { label: string; page: number; more?: boolean; loading: boolean; setPage: (page: number) => void }) {
  if (!page && !more) return null
  return <nav className="pager" aria-label={`${label} pages`}>
    <button disabled={loading || !page} onClick={() => setPage(page - 1)}>Newer {label}</button>
    <span className="muted">Page {page + 1}</span>
    <button disabled={loading || !more} onClick={() => setPage(page + 1)}>Older {label}</button>
  </nav>
}

type Draft = { name: string; phone: string; email: string; gstin: string; gst_legal_name: string; gst_trade_name: string; place_of_supply_state_code: string; address: string; notes: string }
const KEYS: (keyof Draft)[] = ['name', 'phone', 'email', 'gstin', 'gst_legal_name', 'gst_trade_name', 'place_of_supply_state_code', 'address', 'notes']

function problems(d: Draft): Partial<Record<keyof Draft, string>> {
  const out: Partial<Record<keyof Draft, string>> = {}
  if (!d.name.trim()) out.name = "Enter the customer's name."
  const phone = phoneProblem(d.phone, true)
  if (phone) out.phone = phone
  const email = emailProblem(d.email)
  if (email) out.email = email
  const gstin = gstinProblem(d.gstin)
  if (gstin) out.gstin = gstin
  return out
}

export function CustomerForm({ current, close, saved }: { current?: Row; close: () => void; saved: (d: Detail) => void }) {
  const { base } = useCustomersBase()
  const toast = useToast()
  const action = useAction()
  const [draft, setDraft] = useState<Draft>(() => Object.fromEntries(KEYS.map(k => [k, current?.[k] ?? ''])) as Draft)
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({})
  const leave = useDirtyClose(useIsDirty(draft), close)
  const { ref: formRef, focusFirstError } = useFirstError()
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => {
    setDraft({ ...draft, [k]: e.target.value })
    if (errors[k]) setErrors({ ...errors, [k]: undefined })
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    const found = problems(draft)
    setErrors(found)
    if (Object.keys(found).length) {
      focusFirstError()
      return
    }
    // A new customer sends what was filled in; an edit sends only what changed.
    const body: Record<string, string | null> = {}
    for (const k of KEYS) {
      const value = draft[k].trim()
      if (!current ? value : value !== (current[k] ?? '')) body[k] = value || null
    }
    if (current && !Object.keys(body).length) return close()
    const result = await action.run(() => current ? api.patch<Detail>(`${base}/customers/${current.uuid}`, body) : api.post<Detail>(`${base}/customers`, body))
    if (result) {
      toast(current ? 'Customer saved' : 'Customer added')
      saved(result)
    }
  }
  const err = (k: keyof Draft) => errors[k] ?? action.fieldErrors[k]
  return <Modal title={current ? 'Edit customer' : 'Add customer'} onClose={leave} canClose={!action.busy}>
    <form ref={formRef} onSubmit={submit} noValidate><fieldset disabled={action.busy}>
      <p className="muted form-legend">Fields marked <span className="required-mark" aria-hidden="true">*</span> are required.</p>
      <Field label="Name" required maxLength={120} autoFocus value={draft.name} onChange={set('name')} error={err('name')} />
      <Field label="Phone" required type="tel" inputMode="tel" maxLength={20} placeholder="98765 43210" hint="Used to match this customer's bills." value={draft.phone} onChange={set('phone')} error={err('phone')} />
      <Field label="Email" type="email" maxLength={120} value={draft.email} onChange={set('email')} error={err('email')} />
      <Field label="GSTIN" maxLength={15} placeholder="27ABCDE1234F1Z5" hint="Only for business customers who want GST on their bills." value={draft.gstin} onChange={e => set('gstin')({ target: { value: e.target.value.toUpperCase() } })} error={err('gstin')} />
      {(draft.gstin || draft.gst_legal_name || draft.gst_trade_name) && <>
        <Field label="Legal name" maxLength={150} value={draft.gst_legal_name} onChange={set('gst_legal_name')} error={err('gst_legal_name')} />
        <Field label="Trade name" maxLength={150} value={draft.gst_trade_name} onChange={set('gst_trade_name')} error={err('gst_trade_name')} />
      </>}
      <label>Place of supply<select value={draft.place_of_supply_state_code} onChange={set('place_of_supply_state_code')}><option value="">Same as the shop</option>{STATE_OPTIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
      <label className="field-block">Address<textarea rows={2} maxLength={300} value={draft.address} onChange={set('address')} /></label>
      <label className="field-block">Notes<textarea rows={2} maxLength={500} value={draft.notes} onChange={set('notes')} /></label>
    </fieldset>
    {action.error && <Alert>{action.error}</Alert>}
    <div className="actions"><button className="primary" disabled={action.busy}>{action.busy ? 'Saving…' : current ? ACTION.saveChanges : 'Add customer'}</button><button type="button" onClick={leave} disabled={action.busy}>Cancel</button></div>
    </form>
  </Modal>
}

const METHODS = ['cash', 'upi', 'card', 'bank', 'online'] as const

function SettleDialog({ customer, close, saved }: { customer: Row; close: () => void; saved: (d: Detail) => void }) {
  const { base } = useCustomersBase()
  const toast = useToast()
  const path = `${base}/customers/${encodeURIComponent(customer.uuid)}/payments`
  const [amount, setAmount] = useState(customer.due)
  const [method, setMethod] = useState<(typeof METHODS)[number]>('cash')
  const [reference, setReference] = useState('')
  const leave = useDirtyClose(useIsDirty([amount, method, reference]), close)
  const [problem, setProblem] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState<S['CustomerPaymentPreview'] | null>(null)
  // Kept after an unclear failure so a retry cannot record the payment twice.
  const [attempt, setAttempt] = useState<{ body: S['SettleIn']; key: string } | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    const found = attempt ? null : amountProblem(amount)
    setProblem(found)
    if (found || busy) return
    setBusy(true)
    setError(null)
    try {
      if (!attempt && !review) {
        setReview(await api.post<S['CustomerPaymentPreview']>(`${path}/preview`, { amount: amount.trim() }))
        return
      }
      const next = attempt ?? {
        body: { amount: amount.trim(), method, reference: reference.trim() || null, review_key: review?.review_key },
        key: crypto.randomUUID(),
      }
      setAttempt(next)
      const result = await request<Detail>('POST', path, { body: next.body, idempotencyKey: next.key })
      toast(`${formatMoney(String(next.body.amount))} received from ${customer.name}`)
      saved(result)
      close()
    } catch (err) {
      setError(err)
      // A clear refusal changed nothing: let the cashier fix the details.
      if (err instanceof ApiError && (err.status === 422 || (err.status === 409 && err.code !== 'idempotency_conflict'))) {
        setAttempt(null)
        setReview(null)
      }
    } finally { setBusy(false) }
  }
  return <Modal title="Record payment" onClose={leave} canClose={!busy && !attempt}>
    <form onSubmit={submit} noValidate><fieldset disabled={busy || !!attempt}>
      <p>{customer.name} owes <strong>{formatMoney(customer.due)}</strong> on {customer.due_bills} {customer.due_bills === 1 ? 'bill' : 'bills'}. The payment is put against the oldest bill first.</p>
      <Field label="Amount received (₹)" required type="text" inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value); setReview(null); setProblem(null); setError(null) }} error={problem ?? undefined} />
      <label>Paid by<select value={method} onChange={e => setMethod(e.target.value as typeof method)}>{METHODS.map(m => <option key={m} value={m}>{paymentMethod(m)}</option>)}</select></label>
      <Field label="Reference" maxLength={100} placeholder="UPI or cheque number" value={reference} onChange={e => setReference(e.target.value)} />
    </fieldset>
    {review && <section aria-label="Payment allocation">
      <h3>Payment allocation</h3>
      <p>Account balance <strong>{formatMoney(review.due_before)}</strong> before and <strong>{formatMoney(review.due_after)}</strong> after payment.</p>
      <div className="table-wrap"><table className="table"><thead><tr><th>Invoice</th><th>Apply</th><th>Still due</th></tr></thead>
        <tbody>{review.allocations.map(row => <tr key={row.bill_uuid}><td>{row.bill_number}</td><td>{formatMoney(row.amount)}</td><td>{formatMoney(row.due_after)}</td></tr>)}</tbody>
      </table></div>
    </section>}
    {!!error && <Alert>{describeError(error)} {attempt ? 'Details are locked. Retry to safely confirm the same payment.' : ''}</Alert>}
    <div className="actions"><button className="primary" disabled={busy}>{busy ? attempt ? 'Saving…' : 'Reviewing…' : attempt ? 'Retry payment' : review ? 'Confirm payment' : 'Review payment'}</button><button type="button" onClick={leave} disabled={busy || !!attempt}>Cancel</button></div>
    </form>
  </Modal>
}
