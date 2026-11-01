import type { ReactNode } from 'react'
import { Alert, Loading } from '../components/ui/ui'
import { describeError } from '../components/useAction'

/** Loading and error states shared by every report; the report itself renders once data is in. */
export function State<T>({ query, children }: { query: { data: T | undefined; error: unknown; isPending: boolean; isFetching: boolean; refetch?: () => unknown }; children: (data: T) => ReactNode }) {
  if (query.error && !query.data) return <Alert>{describeError(query.error)} {query.refetch && <button className="link" onClick={() => void query.refetch?.()}>Retry report</button>}</Alert>
  if (query.isPending || !query.data) return <Loading label="Working out the numbers…" />
  return (
    <div aria-busy={query.isFetching} className={query.isFetching ? 'refreshing' : undefined}>
      {query.error ? <Alert>{describeError(query.error)} {query.refetch && <button className="link" onClick={() => void query.refetch?.()}>Retry report</button>}</Alert> : null}
      {children(query.data)}
    </div>
  )
}
