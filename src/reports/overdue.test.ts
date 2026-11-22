import { expect, test } from 'vitest'
import type { Ageing } from './queries'
import { overdueAgeing } from './overdue'

export const AGEING: Ageing = { as_of: '2026-11-22', bucket_labels: ['0–7', '8–30', '31–60', '61+'], customers: [{ customer_uuid: 'old', customer_name: 'Older Ravi', customer_phone: '9876543210', buckets: ['100', '20', '0.10', '0.20'], total: '120.30' }, { customer_uuid: 'new', customer_name: 'New Ravi', customer_phone: null, buckets: ['50', '0', '0', '0'], total: '50' }], bucket_totals: ['150', '20', '0.10', '0.20'], total: '170.30' }

test('overdue projection uses only source buckets 2 and 3 and sums exact paise', () => {
  const result = overdueAgeing(AGEING)
  expect(result.customers).toHaveLength(1)
  expect(result.customers[0]).toMatchObject({ customer_uuid: 'old', buckets: ['0.10', '0.20'], total: '0.30' })
  expect(result.bucket_labels).toEqual(['31–60', '61+'])
  expect(result.bucket_totals).toEqual(['0.10', '0.20'])
  expect(result.total).toBe('0.30')
  expect(AGEING.customers[0]?.total).toBe('120.30')
})
