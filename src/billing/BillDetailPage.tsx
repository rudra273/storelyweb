import { ActionMenu } from '../components/ui/workspace'
import { billAction, day, paymentMethod } from '../components/labels'
import { when } from '../components/format'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { Alert, Loading } from '../components/ui/ui'
import { describeError } from '../components/useAction'
import { formatMoney } from '../lib/money'
import { SALES } from '../lib/vocabulary'
import { can } from '../permissions'
import { useShop } from '../shops/context'
import { BillAction, type BillActionKind } from './BillActions'
import { documentKind, documentStatus } from './documentStatus'
import { InvoiceSheet } from './invoice/Invoice'
import { PAPERS, useInvoicePaper } from './invoice/paper'
import { type Paper } from './invoice/InvoiceDocument'
import { useBillingQuery, type BillDetail } from './queries'
import { ShareDialog } from './ShareDialog'

export function BillDetailPage() {
  const { id } = useParams()
  const { current } = useShop()
  const query = useBillingQuery<BillDetail>('bill', `bills/${encodeURIComponent(id ?? '')}`, !!id)
  return <>
    {query.isPending && <Loading />}
    {query.error && <Alert>{describeError(query.error)} <button className="link" onClick={() => void query.refetch()}>Retry</button></Alert>}
    {query.data && <Detail key={`${current?.shop_id}/${id}`} detail={query.data} />}
  </>
}

/** One invoice: its numbers and state on top, the paper on the left, what can be done on the right. */
function Detail({ detail }: { detail: BillDetail }) {
  const { role } = useShop()
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [action, setAction] = useState<BillActionKind | null>(null)
  const [sharing, setSharing] = useState(false)
  const { settings, paper, saved, setPaper } = useInvoicePaper()
  const b = detail.bill
  const status = documentStatus(detail)
  const kind = documentKind(b)
  const isNote = b.document_type === 'credit_note'
  const live = !b.cancelled
  const created = detail.history.find(h => h.action === 'created')
  // The list filters live in its address; "back" returns to them.
  const back = (location.state as { from?: string } | null)?.from ?? '/billing'

  // "Print" on the saved-invoice screen lands here asking for the print dialog, once, when the paper is ready.
  const wantsPrint = params.get('print') === '1'
  const printed = useRef(false)
  useEffect(() => {
    if (!wantsPrint || !settings.data || printed.current) return
    printed.current = true
    // Skip it if the person has already left this invoice.
    setTimeout(() => { if (document.querySelector('.invoice')) window.print() }, 400)
    void navigate(location.pathname, { replace: true, state: location.state })
  }, [wantsPrint, settings.data, navigate, location.pathname, location.state])

  return <div className="invoice-page">
    <header className="no-print invoice-bar">
      <Link className="back-link" to={back}>← {SALES.invoices}</Link>
      <div className="invoice-bar-main">
        <div>
          <p className="eyebrow">{kind.toUpperCase()}</p>
          <h1>{b.bill_number}</h1>
          <p className="muted invoice-sub">{[b.customer_name, day(b.created_at), created?.actor ? `by ${created.actor}` : ''].filter(Boolean).join(' · ')}</p>
        </div>
        <span className={`status-chip status-${status.tone}`}>{status.label}</span>
      </div>
      {!isNote && <dl className="invoice-figures" role="group" aria-label="Amounts">
        <div><dt>Total</dt><dd>{formatMoney(b.total_amount)}</dd></div>
        {live && <><div><dt>Received</dt><dd>{formatMoney(b.paid_amount)}</dd></div>
        <div className={Number(b.balance_due) > 0 ? 'due' : undefined}><dt>Balance due</dt><dd>{formatMoney(b.balance_due)}</dd></div></>}
      </dl>}
      {isNote && <dl className="invoice-figures" role="group" aria-label="Amounts"><div><dt>Credit total</dt><dd>{formatMoney(String(Math.abs(Number(b.total_amount))))}</dd></div>{b.original_bill_uuid && <div><dt>Against invoice</dt><dd><Link to={`/billing/${b.original_bill_uuid}`}>{b.original_bill_number}</Link></dd></div>}</dl>}
    </header>
    {b.cancelled && <div className="no-print"><Alert kind="info">Voided: {b.cancel_reason}. The number stays on record and nothing was deleted.</Alert></div>}

    <div className="invoice-workspace">
      <div className="paper-stage" aria-label={`${kind} preview`}><InvoiceSheet detail={detail} settings={settings} paper={paper} /></div>
      <aside className="invoice-rail no-print" aria-label="Actions">
        <section className="card rail-card">
          <div className="rail-primary">
            <button type="button" className="primary" onClick={() => window.print()}>Print</button>
            <button type="button" onClick={() => setSharing(true)}>Share on WhatsApp</button>
          </div>
          <p className="muted rail-note">To keep a PDF, choose “Save as PDF” in the print window.</p>
          {live && !isNote && <div className="rail-secondary">
            {Number(b.balance_due) > 0 && <button type="button" className="primary" onClick={() => setAction('payment')}>Record payment</button>}
            {can(role, 'billing.cancel') && <button type="button" onClick={() => setAction('return')}>Return items</button>}
          </div>}
          {live && can(role, 'billing.cancel') && <ActionMenu><button type="button" className="danger-link" onClick={() => setAction('cancel')}>Void {kind.toLowerCase()}</button></ActionMenu>}
        </section>
        <section className="card rail-card" aria-label="Print options">
          <label>Paper size<select value={paper} onChange={e => setPaper(e.target.value as Paper)}>{PAPERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
          <p className="muted rail-note">{paper === saved ? 'This is your shop’s saved paper.' : <>For this print only. Your saved paper stays <strong>{saved}</strong>.</>}</p>
          {can(role, 'shop.settings') && <Link to="/settings" className="rail-link">Change the saved paper and layout</Link>}
        </section>
      </aside>
    </div>

    <div className="no-print invoice-records">
      <section className="card"><h2>Payments</h2>{detail.payments.length ? <ul className="plain">{detail.payments.map(p => <li className="row" key={p.uuid}><span>{day(p.received_at)} · {paymentMethod(p.payment_method)}<br /><small className="muted">{[p.payment_reference, p.notes].filter(Boolean).join(' · ')}</small></span><strong>{formatMoney(p.amount)}</strong></li>)}</ul> : <p className="muted">No payments recorded.</p>}</section>
      {!!detail.credit_notes.length && <section className="card"><h2>Credit notes</h2>{detail.credit_notes.map(n => <p key={n.uuid}><Link to={`/billing/${n.uuid}`}>{n.bill_number}</Link> · {formatMoney(String(Math.abs(Number(n.total_amount))))}</p>)}</section>}
      <section className="card"><h2>History</h2>{detail.history.length ? <ol className="timeline">{detail.history.map((h, i) => <li key={i}><strong>{billAction(h.action)}</strong>{h.actor ? <span className="muted"> · {h.actor}</span> : null}<small className="muted">{when(h.created_at)}{h.details ? ` · ${h.details}` : ''}</small></li>)}</ol> : <p className="muted">No activity yet.</p>}</section>
    </div>
    {action && <BillAction key={action} action={action} detail={detail} close={() => setAction(null)} />}
    {sharing && <ShareDialog detail={detail} close={() => setSharing(false)} />}
  </div>
}
