import { useState } from 'react'
import { Alert } from '../components/ui'
import { describeError } from '../components/useAction'
import { PRESETS, type Preset } from './periods'
import type { Period } from './usePeriod'

export function PeriodPicker({ period }: { period: Period }) {
  return (
    <div className="period no-print">
      <div className="field">
        <label htmlFor="period">Period</label>
        <select id="period" value={period.preset} onChange={(e) => period.set(e.target.value as Preset)}>
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {period.preset === 'custom' && (
        <>
          <div className="field">
            <label htmlFor="from">From</label>
            <input id="from" type="date" value={period.from} max={period.to} onChange={(e) => period.set('custom', e.target.value, period.to)} />
          </div>
          <div className="field">
            <label htmlFor="to">To</label>
            <input id="to" type="date" value={period.to} min={period.from} onChange={(e) => period.set('custom', period.from, e.target.value)} />
          </div>
        </>
      )}
      <p className="muted period-text">
        {period.from === period.to ? period.from : `${period.from} to ${period.to}`}
      </p>
    </div>
  )
}

/** Download as CSV or Excel, or print the page (the browser can save a print as PDF). */
export function DownloadBar({ save, excelOnly = false }: { save: (format: 'csv' | 'xlsx') => Promise<void>; excelOnly?: boolean }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function go(format: 'csv' | 'xlsx') {
    setBusy(true)
    setError(null)
    try {
      await save(format)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="no-print">
      <div className="actions">
        {!excelOnly && (
          <button disabled={busy} onClick={() => void go('csv')}>
            Download CSV
          </button>
        )}
        <button disabled={busy} onClick={() => void go('xlsx')}>
          Download Excel
        </button>
        <button onClick={() => window.print()}>Print / Save as PDF</button>
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  )
}

export function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <strong className={tone ? `kpi-value ${tone}` : 'kpi-value'}>{value}</strong>
      {note && <small className="muted">{note}</small>}
    </div>
  )
}
