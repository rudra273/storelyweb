import { Link } from 'react-router'
import { formatMoney } from '../../lib/money'

export interface Trend { label: string; value: number }
/** What the server says changed. The browser never works this out, so it is passed in already worded. */
export interface Comparison { text: string; direction: 'up' | 'down' | 'flat' }

const ARROW = { up: '▲', down: '▼', flat: '▬' } as const

/**
 * One headline figure. `value` of null means the figure is not available (not loaded, not
 * tracked), which reads as an em dash and is announced as such; it is never shown as zero.
 * `comparison` of null means there is nothing to compare with ("No comparison").
 */
export function Kpi({ label, value, note, tone, comparison, trend, trendTitle, to }: { label: string; value: string | null | undefined; note?: string; tone?: 'good' | 'bad'; comparison?: Comparison | null; trend?: Trend[]; trendTitle?: string; to?: string }) {
  const missing = value === null || value === undefined
  return <div className="kpi">
    <span className="kpi-label">{to ? <Link className="kpi-link" to={to}>{label}</Link> : label}</span>
    <strong className={tone ? `kpi-value ${tone}` : 'kpi-value'}>{missing ? <><span aria-hidden="true">—</span><span className="sr-only">Not available</span></> : value}</strong>
    {comparison !== undefined && (comparison
      ? <small className={`kpi-change ${comparison.direction}`}><span aria-hidden="true">{ARROW[comparison.direction]}</span> {comparison.text}</small>
      : <small className="muted kpi-change">No comparison</small>)}
    {note && <small className="muted">{note}</small>}
    {trend && trend.length > 1 && <Sparkline points={trend} title={trendTitle ?? label} />}
  </div>
}

/** A small line of recent values. The exact numbers are one click away in a table, so nothing depends on seeing the line. */
export function Sparkline({ points, title }: { points: Trend[]; title: string }) {
  const width = 160, height = 36, pad = 3
  const values = points.map(p => p.value)
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2)
  const y = (v: number) => height - pad - ((v - lo) / span) * (height - pad * 2)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
  const first = points[0]!, last = points[points.length - 1]!
  return <figure className="sparkline">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: from ${formatMoney(String(first.value))} on ${first.label} to ${formatMoney(String(last.value))} on ${last.label}`} preserveAspectRatio="none">
      <path d={d} className="sparkline-line" fill="none" />
      <circle cx={x(points.length - 1)} cy={y(last.value)} r="2.5" className="sparkline-dot" />
    </svg>
    <ValuesTable title={title} points={points} />
  </figure>
}

/** The exact values behind a chart, for anyone who cannot or would rather not read a graphic. */
export function ValuesTable({ title, points }: { title: string; points: Trend[] }) {
  return <details className="chart-values no-print">
    <summary>Show values<span className="sr-only"> for {title}</span></summary>
    <table className="table"><thead><tr><th>Day</th><th className="num">Amount</th></tr></thead>
      <tbody>{points.map(p => <tr key={p.label}><td>{p.label}</td><td className="num">{formatMoney(String(p.value))}</td></tr>)}</tbody></table>
  </details>
}
