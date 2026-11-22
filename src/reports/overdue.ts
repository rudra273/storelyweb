import { paymentMinorUnits } from '../billing/checkout/settlement'
import type { Ageing } from './queries'

export function paiseText(value: bigint): string { return `${value / 100n}.${String(value % 100n).padStart(2, '0')}` }
const paise = (value: string | undefined) => paymentMinorUnits(value ?? '') ?? 0n
/** The existing report defines bucket 2 and 3 as older than thirty days. */
export function overdueAgeing(source: Ageing): Ageing {
  const customers = source.customers.filter(row => paise(row.buckets[2]) + paise(row.buckets[3]) > 0n).map(row => ({ ...row, buckets: [row.buckets[2] ?? '0', row.buckets[3] ?? '0'], total: paiseText(paise(row.buckets[2]) + paise(row.buckets[3])) }))
  const totals = [0n, 0n]
  for (const row of customers) { totals[0] = totals[0]! + paise(row.buckets[0]); totals[1] = totals[1]! + paise(row.buckets[1]) }
  return { ...source, customers, bucket_labels: source.bucket_labels.slice(2, 4), bucket_totals: totals.map(paiseText), total: paiseText(totals[0]! + totals[1]!) }
}
