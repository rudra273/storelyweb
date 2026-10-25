import { Empty } from '../components/ui'

export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <h1>{title}</h1>
      <Empty title="Not built yet">{note}</Empty>
    </div>
  )
}
