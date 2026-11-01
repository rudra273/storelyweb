import { describeError } from '../useAction'
import { useOnline } from '../../lib/useOnline'
import { Alert } from './ui'

/** A failed read: what went wrong in plain words, and a way to try again. */
export function ErrorState({ error, onRetry, retryLabel = 'Retry' }: { error: unknown; onRetry?: () => void; retryLabel?: string }) {
  return <Alert>{describeError(error)} {onRetry && <button className="link" onClick={onRetry}>{retryLabel}</button>}</Alert>
}

/** A placeholder block. Decorative: pair it with a labelled busy region, never use it as the only signal. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />
}

/** Stand-ins for KPI tiles while figures load, so an unloaded number can never be mistaken for ₹0. */
export function KpiSkeletons({ count, className = 'kpis', label = 'Loading figures…' }: { count: number; className?: string; label?: string }) {
  return <div className={className} role="status" aria-busy="true" aria-label={label}>
    {Array.from({ length: count }, (_, i) => <div className="kpi kpi-loading" key={i}><Skeleton className="skeleton-label" /><Skeleton className="skeleton-value" /></div>)}
  </div>
}

/** Shown across the app while offline. Nothing is sent from here, so no work is lost by waiting. */
export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return <div className="offline-banner" role="status"><strong>You are offline.</strong> Saving is paused until you reconnect. What you have typed stays on this page.</div>
}
