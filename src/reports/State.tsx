import type { ReactNode } from 'react'
import { Alert, Loading } from '../components/ui'
import { describeError } from '../components/useAction'

/** Loading and error states shared by every report; the report itself renders once data is in. */
export function State<T>({ query, children }: { query: { data: T | undefined; error: unknown; isPending: boolean; isFetching: boolean }; children: (data: T) => ReactNode }) {
  if (query.error && !query.data) return <Alert>{describeError(query.error)}</Alert>
  if (query.isPending || !query.data) return <Loading label="Working out the numbers…" />
  return (
    <div aria-busy={query.isFetching} className={query.isFetching ? 'refreshing' : undefined}>
      {query.error ? <Alert>{describeError(query.error)}</Alert> : null}
      {children(query.data)}
    </div>
  )
}
