import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { components } from '../api/schema'
import { api, request } from '../api/client'
import { useShop } from '../shops/context'

type S = components['schemas']
export type BillDetail = S['BillDetail']
export type BillInput = S['BillIn']
export type CartInput = S['CartIn']
export type Preview = S['Preview']
export type Customer = S['CustomerOut']
export type InvoiceSettings = S['InvoiceSettings']
export type BillPage = S['BillPage']
export type PaymentInput = S['PaymentIn']
export type CreditInput = S['CreditNoteIn']

export function useBillingQuery<T>(key: string, path: string, enabled = true) {
  const shop = useShop().current?.shop_id ?? ''
  return useQuery({ queryKey: [key, shop, path], queryFn: () => api.get<T>(`/v1/shops/${shop}/${path}`), enabled: !!shop && enabled })
}

export function useBillingMutation<T>(run: (base: string, input: T) => Promise<BillDetail>) {
  const shop = useShop().current?.shop_id ?? ''
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: T) => run(`/v1/shops/${shop}`, input),
    retry: false,
    onSettled: () => {
      // Payments, returns and cancellation change reports, products and customers too.
      // Do not make a successful write look failed if refreshing a view fails.
      for (const key of ['bills', 'bill', 'products', 'product', 'report', 'customers']) {
        void client.invalidateQueries({ queryKey: [key, shop] })
      }
    },
  })
}

export const createBill = (base: string, input: { body: BillInput; key: string }) =>
  request<BillDetail>('POST', `${base}/bills`, { body: input.body, idempotencyKey: input.key })
