import { Link } from 'react-router'
import { formatMoney } from '../../lib/money'
import { SALES } from '../../lib/vocabulary'
import type { BillDetail } from '../queries'

/** Shown once an invoice is saved: what was recorded, and the three things a cashier does next.
 * The invoice is final here, so there is no second "create" button to press by mistake. */
export function Completion({ detail, onAnother }: { detail: BillDetail; onAnother: () => void }) {
  const b = detail.bill
  const due = Number(b.balance_due) > 0
  return <section className="card completion" aria-labelledby="completion-title">
    <p className="completion-mark" aria-hidden="true">✓</p>
    <h2 id="completion-title" tabIndex={-1} ref={el => el?.focus()}>Invoice saved</h2>
    <p className="completion-number">{b.bill_number}</p>
    <dl className="completion-figures">
      <div><dt>Total</dt><dd>{formatMoney(b.total_amount)}</dd></div>
      <div><dt>Received</dt><dd>{formatMoney(b.paid_amount)}</dd></div>
      <div className={due ? 'due' : undefined}><dt>{due ? 'Balance due' : 'Balance'}</dt><dd>{formatMoney(b.balance_due)}</dd></div>
    </dl>
    <div className="actions">
      <Link className="button primary" to={`/billing/${b.uuid}?print=1`}>Print</Link>
      <button type="button" onClick={onAnother}>{SALES.newInvoice}</button>
      <Link className="button secondary" to={`/billing/${b.uuid}`}>View invoice</Link>
    </div>
  </section>
}
