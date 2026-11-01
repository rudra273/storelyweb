import { useSearchParams } from 'react-router'
import { day } from '../components/labels'
import { Alert, Empty } from '../components/ui/ui'
import { formatMoney, formatQty } from '../lib/money'
import { DownloadBar, PeriodPicker } from './ReportBits'
import { useReport, useReportDownload, type Expiring, type Gstr1, type Purchases, type StockValuation, type TaxSummary } from './queries'
import { State } from './State'
import { usePeriod } from './usePeriod'

export function ExpiringPage() {
  const [params, setParams] = useSearchParams()
  const days = ['7', '30', '60', '90'].includes(params.get('days') ?? '') ? (params.get('days') as string) : '30'
  const query = useReport<Expiring>('expiring-stock', { days })
  const save = useReportDownload('expiring-stock', { days })
  return (
    <div>
      <div className="period no-print">
        <div className="field">
          <label htmlFor="days">Expiring within</label>
          <select id="days" value={days} onChange={(e) => { const q = new URLSearchParams(params); q.set('days', e.target.value); setParams(q, { replace: true }) }}>
            {['7', '30', '60', '90'].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </div>
      </div>
      <State query={query}>
        {(e) => (
          <>
            <DownloadBar save={save} />
            {e.batches.length === 0 ? <Empty title="Nothing is about to expire" /> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Product</th><th>Batch</th><th>Expires</th><th>Still on the shelf</th></tr></thead>
                <tbody>
                  {e.batches.map((b) => (
                    <tr key={`${b.product_uuid}-${b.batch_no}-${b.expiry}`}>
                      <td>{b.product_name}</td><td>{b.batch_no ?? '—'}</td>
                      <td>{b.expiry} {b.expired && <span className="badge warn">expired</span>}</td>
                      <td>{formatQty(b.quantity)} {b.unit ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
            <p className="muted">Stock on hand is matched to the newest purchases first, as in the phone app.</p>
          </>
        )}
      </State>
    </div>
  )
}

export function PurchasesPage() {
  const period = usePeriod()
  const params = { from: period.from, to: period.to }
  const query = useReport<Purchases>('purchase-register', params, !period.invalid)
  const save = useReportDownload('purchase-register', params)
  return (
    <div>
      <PeriodPicker period={period} />
      {period.invalid ? <Empty title="Pick a start and an end date" /> : (
        <State query={query}>
          {(p) => (
            <>
              <DownloadBar save={save} />
              {p.rows.length === 0 ? <Empty title="No stock was received in this period" /> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>Date</th><th>Product</th><th>Supplier</th><th>Quantity</th><th>Unit cost</th><th>Amount</th><th>Batch</th></tr></thead>
                  <tbody>
                    {p.rows.map((r, i) => (
                      <tr key={`${r.date}-${r.product_name}-${i}`}>
                        <td>{day(r.date)}</td><td>{r.product_name}{r.imported && <span className="badge">import</span>}</td><td>{r.supplier ?? '—'}</td>
                        <td>{formatQty(r.quantity)} {r.unit ?? ''}</td><td>{formatMoney(r.unit_cost)}</td><td>{formatMoney(r.amount)}</td>
                        <td>{r.batch_no ?? '—'}{r.expiry ? <><br /><small className="muted">expires {r.expiry}</small></> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><th colSpan={5}>Total</th><th>{formatMoney(p.total)}</th><th /></tr></tfoot>
                </table></div>
              )}
            </>
          )}
        </State>
      )}
    </div>
  )
}

export function TaxPage() {
  const period = usePeriod()
  const params = { from: period.from, to: period.to }
  const query = useReport<TaxSummary>('tax-summary', params, !period.invalid)
  const gst = useReport<Gstr1>('gstr1', params, !period.invalid)
  const saveTax = useReportDownload('tax-summary', params)
  const saveGstr1 = useReportDownload('gstr1', params)
  return (
    <div>
      <PeriodPicker period={period} />
      {period.invalid ? <Empty title="Pick a start and an end date" /> : (
        <>
          <State query={query}>
            {(t) => (
              <>
                <DownloadBar save={saveTax} />
                {!t.gst_registered && <Alert kind="info">Your shop is not GST-registered, so no GST is charged on bills and the tax columns stay at ₹0. Rates are shown for your records.</Alert>}
                {t.rates.length === 0 ? <Empty title="No sales with GST in this period" /> : (
                  <div className="table-wrap"><table className="table">
                    <thead><tr><th>GST rate</th><th>Taxable value</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total tax</th></tr></thead>
                    <tbody>
                      {t.rates.map((r) => (
                        <tr key={r.rate}><td>{formatQty(r.rate)}%</td><td>{formatMoney(r.taxable)}</td><td>{formatMoney(r.cgst)}</td><td>{formatMoney(r.sgst)}</td><td>{formatMoney(r.igst)}</td><td>{formatMoney(r.tax)}</td></tr>
                      ))}
                    </tbody>
                    <tfoot><tr><th>Total</th><th>{formatMoney(t.total_taxable)}</th><th colSpan={3} /><th>{formatMoney(t.total_tax)}</th></tr></tfoot>
                  </table></div>
                )}
              </>
            )}
          </State>
          <section className="card wide">
            <h2>GSTR-1 workbook</h2>
            <p className="muted">The same sheets as the phone app (b2b, b2cl, b2cs, cdnr, hsn, docs). Pick one calendar month (“This month” or “Last month”) before filing, and have your CA review it.</p>
            <State query={gst}>
              {(g) => (
                <>
                  {!g.gstin && <Alert kind="info">Add your GSTIN to the shop profile on the phone app so it appears on the workbook.</Alert>}
                  <ul className="plain">
                    {Object.entries(g.sheets).map(([name, rows]) => (
                      <li key={name} className="row"><span>{name}</span><span className="muted">{Math.max(0, rows.length - 1)} row{rows.length === 2 ? '' : 's'}</span></li>
                    ))}
                  </ul>
                  <p>Taxable value {formatMoney(g.totals.taxable)} · IGST {formatMoney(g.totals.igst)} · CGST {formatMoney(g.totals.cgst)} · SGST {formatMoney(g.totals.sgst)}</p>
                  <DownloadBar save={saveGstr1} excelOnly />
                </>
              )}
            </State>
          </section>
        </>
      )}
    </div>
  )
}

export function StockValuePage() {
  const query = useReport<StockValuation>('stock-valuation', {})
  const save = useReportDownload('stock-valuation', {})
  return (
    <State query={query}>
      {(v) => (
        <>
          <DownloadBar save={save} />
          <p className="muted report-note">{v.gst_registered
            ? 'Cost per unit is the cost price plus overhead. GST you pay on purchases is claimed back, so it is not part of cost.'
            : 'Your shop is not GST-registered, so GST paid on purchases is part of cost: cost per unit is the cost price plus that GST (at the rate shown) and any overhead.'}</p>
          {v.items.length === 0 ? <Empty title="No stock on hand" /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Product</th><th>Category</th><th>Quantity</th><th className="num">GST</th><th className="num">Cost per unit</th><th className="num">At cost</th><th className="num">At selling price</th></tr></thead>
              <tbody>
                {v.items.map((i, n) => (
                  <tr key={`${i.name}-${n}`}><td>{i.name}</td><td>{i.category ?? '—'}</td><td>{formatQty(i.quantity)} {i.unit ?? ''}</td><td className="num">{formatQty(i.gst_percent)}%</td><td className="num">{formatMoney(i.unit_cost)}</td><td className="num">{formatMoney(i.cost_value)}</td><td className="num">{formatMoney(i.sale_value)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><th colSpan={5}>Total</th><th className="num">{formatMoney(v.total_cost)}</th><th className="num">{formatMoney(v.total_sale)}</th></tr></tfoot>
            </table></div>
          )}
        </>
      )}
    </State>
  )
}
