import type { ReactNode } from 'react'
import { Loading } from '../components/ui/ui'
import { ErrorState } from '../components/ui/states'

/** Loading and error states shared by every report; the report itself renders once data is in. */
export function State<T>({ query, children, fallback }: { query: { data: T | undefined; error: unknown; isPending: boolean; isFetching: boolean; dataUpdatedAt?: number; refetch?: () => unknown }; children: (data: T) => ReactNode; /** Shown while loading instead of the plain message, e.g. KPI skeletons. */ fallback?: ReactNode }) {
  const retry = query.refetch ? () => void query.refetch?.() : undefined
  if (query.error && !query.data) return <ErrorState error={query.error} onRetry={retry} retryLabel="Retry report" />
  if (query.isPending || !query.data) return fallback ?? <Loading label="Working out the numbers…" />
  return (
    <div aria-busy={query.isFetching} className={query.isFetching ? 'refreshing' : undefined}>
      {query.error ? <ErrorState error={query.error} onRetry={retry} retryLabel="Retry report" /> : null}
      {query.dataUpdatedAt ? <p className="muted updated-at no-print">Updated {new Date(query.dataUpdatedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</p> : null}
      {children(query.data)}
    </div>
  )
}
