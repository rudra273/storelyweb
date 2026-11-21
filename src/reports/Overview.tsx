import { useLocation } from 'react-router'
import { Empty } from '../components/ui/ui'
import { KpiSkeletons } from '../components/ui/states'
import { formatMoney, formatQty } from '../lib/money'
import { BarChart, HBars } from './charts'
import { DownloadBar, PeriodPicker, Tile } from './ReportBits'
import { useReport, useReportDownload, type Kpis } from './queries'
import { State } from './State'
import { usePeriod } from './usePeriod'

export function Overview() {
  const period = usePeriod()
  const { search } = useLocation()
  const params = { from: period.from, to: period.to }
  const query = useReport<Kpis>('kpis', params, !period.invalid)
  const save = useReportDownload('kpis', params)
  return (
    <div>
      <PeriodPicker period={period} />
      {period.invalid ? <Empty title="Pick a start and an end date">The start must not be after the end.</Empty> : (
        <State query={query} fallback={<KpiSkeletons count={8} />}>
          {(k) => (
            <>
              <DownloadBar save={save} />
              <div className="kpis">
                <Tile label="Sales" value={formatMoney(k.revenue)} note={`${k.invoices} invoice${k.invoices === 1 ? '' : 's'}, net of returns`} comparison={k.comparisons ? k.comparisons.revenue ?? null : undefined} trend={k.daily.map(d => ({ label: d.day, value: Number(d.revenue) }))} trendTitle="Sales by day" to={`/billing?from=${period.from}&to=${period.to}`} />
                <Tile label="Money received" value={formatMoney(k.collected)} comparison={k.comparisons ? k.comparisons.collected ?? null : undefined} to={`/billing?status=paid&from=${period.from}&to=${period.to}`} />
                <Tile label="Gross profit" value={formatMoney(k.gross_profit)} note={`${k.gross_margin_percent}% margin${k.uncosted_item_count ? ` · ${k.uncosted_item_count} sold item${k.uncosted_item_count === 1 ? '' : 's'} with no cost price left out` : ''}`} tone={Number(k.gross_profit) < 0 ? 'bad' : 'good'} comparison={k.comparisons ? k.comparisons.gross_profit ?? null : undefined} to={`/reports/profit-loss${search}`} />
                <Tile label="Expenses" value={formatMoney(k.expenses)} comparison={k.comparisons ? k.comparisons.expenses ?? null : undefined} to={`/expenses?start=${period.from}&end=${period.to}`} />
                <Tile label="Average sale" value={formatMoney(k.average_order_value)} note={`${k.discount_rate_percent}% given as discount`} />
                <Tile label="GST collected" value={formatMoney(k.gst_collected)} to={`/reports/tax${search}`} />
                <Tile label="Still to receive" value={formatMoney(k.unpaid_total)} note={`${k.unpaid_count} unpaid invoice${k.unpaid_count === 1 ? '' : 's'}, all time`} tone={k.unpaid_count ? 'bad' : undefined} to="/customers?owing=1" />
                <Tile label="Stock at cost" value={formatMoney(k.inventory_value)} note={`${k.out_of_stock_count} out of stock · ${k.low_stock_count} running low${k.gst_registered ? '' : ' · includes GST paid on purchase'}`} to="/reports/stock" />
              </div>
              {k.daily.length === 0 ? (
                <Empty title="No sales in this period" />
              ) : (
                <section className="card wide">
                  <h2>Sales by day</h2>
                  <BarChart title="Sales by day" points={k.daily.map((d) => ({ label: d.day, value: Number(d.revenue) }))} />
                </section>
              )}
              <div className="grid-2">
                {k.by_payment_method.length > 0 && (
                  <section className="card">
                    <h2>Money received, by method</h2>
                    <HBars rows={k.by_payment_method.map((m) => ({ label: m.method, value: Number(m.total) }))} />
                  </section>
                )}
                {k.by_category.length > 0 && (
                  <section className="card">
                    <h2>Sales by category</h2>
                    <HBars rows={k.by_category.map((c) => ({ label: c.category, value: Number(c.revenue) }))} />
                  </section>
                )}
                {(k.expenses_by_category?.length ?? 0) > 0 && (
                  <section className="card">
                    <h2>Expenses by category</h2>
                    <HBars rows={k.expenses_by_category!.map((e) => ({ label: e.category, value: Number(e.amount) }))} />
                  </section>
                )}
                {k.top_by_revenue.length > 0 && (
                  <section className="card">
                    <h2>Best sellers by value</h2>
                    <HBars rows={k.top_by_revenue.map((p) => ({ label: p.name, value: Number(p.revenue) }))} />
                  </section>
                )}
                {k.top_by_units.length > 0 && (
                  <section className="card">
                    <h2>Best sellers by quantity</h2>
                    <HBars format={formatQty} rows={k.top_by_units.map((p) => ({ label: p.name, value: Number(p.units) }))} />
                  </section>
                )}
              </div>
            </>
          )}
        </State>
      )}
    </div>
  )
}
