import { useSearchParams } from 'react-router'
import { Empty } from '../components/ui'
import { formatMoney } from '../lib/money'
import { DownloadBar, PeriodPicker } from './ReportBits'
import { today } from './periods'
import { useReport, useReportDownload, type Ageing, type DayBook, type ProfitLoss } from './queries'
import { State } from './State'
import { usePeriod } from './usePeriod'

function useDay(key: string): [string, (day: string) => void] {
  const [params, setParams] = useSearchParams()
  const value = params.get(key)
  const day = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today()
  return [day, (next) => { const q = new URLSearchParams(params); q.set(key, next); setParams(q, { replace: true }) }]
}

export function DayBookPage() {
  const [day, setDay] = useDay('day')
  const query = useReport<DayBook>('day-book', { day })
  const save = useReportDownload('day-book', { day })
  return (
    <div>
      <div className="period no-print">
        <div className="field">
          <label htmlFor="day">Day</label>
          <input id="day" type="date" value={day} max={today()} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </div>
      </div>
      <State query={query}>
        {(b) => (
          <>
            <DownloadBar save={save} />
            <div className="kpis">
              <div className="kpi"><span className="kpi-label">Sales</span><strong className="kpi-value">{formatMoney(b.sales)}</strong></div>
              <div className="kpi"><span className="kpi-label">Money received</span><strong className="kpi-value">{formatMoney(b.collected)}</strong></div>
              <div className="kpi"><span className="kpi-label">Expenses</span><strong className="kpi-value">{formatMoney(b.total_expenses)}</strong></div>
              <div className="kpi"><span className="kpi-label">Cash drawer change</span><strong className={Number(b.net_cash) < 0 ? 'kpi-value bad' : 'kpi-value'}>{formatMoney(b.net_cash)}</strong><small className="muted">cash in {formatMoney(b.cash_received)}, cash out {formatMoney(b.cash_expenses)}</small></div>
            </div>
            <h2>Bills</h2>
            {b.bills.length === 0 ? <Empty title="No bills on this day" /> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Number</th><th>Customer</th><th>Total</th><th>Paid</th><th>Due</th></tr></thead>
                <tbody>
                  {b.bills.map((x) => (
                    <tr key={x.uuid}>
                      <td>{x.bill_number}{x.document_type === 'credit_note' && <span className="badge warn">return</span>}</td>
                      <td>{x.customer_name}</td><td>{formatMoney(x.total_amount)}</td><td>{formatMoney(x.paid_amount)}</td><td>{formatMoney(x.balance_due)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
            <div className="grid-2">
              <section className="card">
                <h2>Money received</h2>
                {b.payments_by_method.length === 0 ? <p className="muted">None.</p> : (
                  <table className="table"><tbody>{b.payments_by_method.map((p) => <tr key={p.method}><td>{p.method}</td><td>{formatMoney(p.amount)}</td></tr>)}</tbody></table>
                )}
              </section>
              <section className="card">
                <h2>Expenses</h2>
                {b.expenses.length === 0 ? <p className="muted">None.</p> : (
                  <table className="table"><tbody>{b.expenses.map((e) => <tr key={e.uuid}><td>{e.category}<br /><small className="muted">{e.payment_method}</small></td><td>{formatMoney(e.amount)}</td></tr>)}</tbody></table>
                )}
              </section>
            </div>
          </>
        )}
      </State>
    </div>
  )
}

export function ProfitLossPage() {
  const period = usePeriod()
  const params = { from: period.from, to: period.to }
  const query = useReport<ProfitLoss>('profit-loss', params, !period.invalid)
  const save = useReportDownload('profit-loss', params)
  return (
    <div>
      <PeriodPicker period={period} />
      {period.invalid ? <Empty title="Pick a start and an end date" /> : (
        <State query={query}>
          {(p) => (
            <>
              <DownloadBar save={save} />
              <table className="table statement">
                <tbody>
                  <tr><td>Sales (without GST)</td><td>{formatMoney(p.sales)}</td></tr>
                  <tr><td>Cost of goods sold</td><td>{formatMoney(p.cost_of_goods)}</td></tr>
                  <tr className="total"><td>Gross profit</td><td>{formatMoney(p.gross_profit)}</td></tr>
                  {p.expenses_by_category.map((e) => <tr key={e.category}><td className="indent">{e.category}</td><td>{formatMoney(e.amount)}</td></tr>)}
                  <tr><td>Total expenses</td><td>{formatMoney(p.expenses)}</td></tr>
                  <tr className="total"><td>Net profit</td><td className={Number(p.net_profit) < 0 ? 'bad' : undefined}>{formatMoney(p.net_profit)}</td></tr>
                </tbody>
              </table>
              <p className="muted">GST collected in this period, which is not income: {formatMoney(p.gst_collected)}. Sales and cost are after returns.</p>
            </>
          )}
        </State>
      )}
    </div>
  )
}

export function ReceivablesPage() {
  const [asOf, setAsOf] = useDay('as_of')
  const query = useReport<Ageing>('receivables-ageing', { as_of: asOf })
  const save = useReportDownload('receivables-ageing', { as_of: asOf })
  return (
    <div>
      <div className="period no-print">
        <div className="field">
          <label htmlFor="asof">As of</label>
          <input id="asof" type="date" value={asOf} max={today()} onChange={(e) => e.target.value && setAsOf(e.target.value)} />
        </div>
      </div>
      <State query={query}>
        {(a) => (
          <>
            <DownloadBar save={save} />
            {a.customers.length === 0 ? <Empty title="Nobody owes you anything">All bills are paid up.</Empty> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Customer</th>{a.bucket_labels.map((l) => <th key={l}>{l}</th>)}<th>Total</th></tr></thead>
                <tbody>
                  {a.customers.map((c) => (
                    <tr key={`${c.customer_name}-${c.customer_phone}`}>
                      <td>{c.customer_name}{c.customer_phone && <><br /><small className="muted">{c.customer_phone}</small></>}</td>
                      {c.buckets.map((v, i) => <td key={a.bucket_labels[i]}>{Number(v) ? formatMoney(v) : '—'}</td>)}
                      <td><strong>{formatMoney(c.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><th>Total</th>{a.bucket_totals.map((v, i) => <th key={a.bucket_labels[i]}>{formatMoney(v)}</th>)}<th>{formatMoney(a.total)}</th></tr></tfoot>
              </table></div>
            )}
          </>
        )}
      </State>
    </div>
  )
}
