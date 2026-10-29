import { Alert, Loading } from '../components/ui'
import { Button } from '../components/workspace'
import { describeError } from '../components/useAction'
import { PAGE } from './shared'
export function QueryState({ pending, error, retry }: { pending: boolean; error: unknown; retry: () => void }) {
  if (pending) return <Loading />
  if (error) return <><Alert>{describeError(error)}</Alert><Button onClick={retry}>Retry</Button></>
  return null
}
export function Pager({ offset, setOffset, more }: { offset: number; setOffset: (n: number) => void; more: boolean }) {
  return <div className="platform-pager"><Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Button><span>Page {Math.floor(offset / PAGE) + 1}</span><Button disabled={!more} onClick={() => setOffset(offset + PAGE)}>Next</Button></div>
}
export function Status({ value }: { value: string }) { return <span className={`platform-status status-${value}`}>{value}</span> }
