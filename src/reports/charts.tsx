import { ValuesTable } from '../components/ui/Kpi'
import { formatMoney } from '../lib/money'

export interface Point {
  label: string
  value: number
}

/** Vertical bars over time. Negative days (returns) hang below the zero line. */
export function BarChart({ points, title }: { points: Point[]; title: string }) {
  if (points.length === 0) return null
  const width = 640
  const height = 180
  const pad = { top: 8, bottom: 22, left: 4, right: 4 }
  const values = points.map((p) => p.value)
  const max = Math.max(0, ...values)
  const min = Math.min(0, ...values)
  const span = max - min || 1
  const plot = height - pad.top - pad.bottom
  const zero = pad.top + (max / span) * plot
  const slot = (width - pad.left - pad.right) / points.length
  const bar = Math.max(2, Math.min(36, slot * 0.7))
  const summary = `${title}: ${points.map((p) => `${p.label} ${formatMoney(String(p.value))}`).join(', ')}`
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary} preserveAspectRatio="xMidYMid meet">
        <line x1={pad.left} x2={width - pad.right} y1={zero} y2={zero} className="chart-axis" />
        {points.map((p, i) => {
          const h = (Math.abs(p.value) / span) * plot
          const x = pad.left + slot * i + (slot - bar) / 2
          return (
            <rect key={p.label} x={x} y={p.value >= 0 ? zero - h : zero} width={bar} height={Math.max(h, p.value === 0 ? 0 : 1)} className={p.value < 0 ? 'chart-bar neg' : 'chart-bar'}>
              <title>{`${p.label}: ${formatMoney(String(p.value))}`}</title>
            </rect>
          )
        })}
        <text x={pad.left} y={height - 6} className="chart-label">
          {points[0]?.label}
        </text>
        <text x={width - pad.right} y={height - 6} textAnchor="end" className="chart-label">
          {points[points.length - 1]?.label}
        </text>
      </svg>
      <ValuesTable title={title} points={points} />
    </figure>
  )
}

/** Horizontal bars with the label and value written out, so nothing depends on colour or shape. */
export function HBars({ rows, format = formatMoney }: { rows: Point[]; format?: (v: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)))
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="hbar-label">{r.label}</span>
          <span className="hbar-track" aria-hidden="true">
            <span className={r.value < 0 ? 'hbar-fill neg' : 'hbar-fill'} style={{ width: `${(Math.abs(r.value) / max) * 100}%` }} />
          </span>
          <span className="hbar-value">{format(String(r.value))}</span>
        </li>
      ))}
    </ul>
  )
}
