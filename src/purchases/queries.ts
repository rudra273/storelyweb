import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useShop } from '../shops/context'
import type { Receipt, ReceiptInput } from './contracts'

export const RECEIPT_PAGE_SIZE = 25
export function useReceipts(page: number) {
  const shop = useShop().current?.shop_id ?? ''
  return useQuery({ queryKey: ['purchase-receipts', shop, page], enabled: !!shop,
    queryFn: () => api.get<Receipt[]>(`/v1/shops/${shop}/purchase-receipts?limit=${RECEIPT_PAGE_SIZE}&offset=${page * RECEIPT_PAGE_SIZE}`) })
}
export function useConfirmReceipt() {
  const shop = useShop().current?.shop_id ?? ''
  const client = useQueryClient()
  return useMutation({ retry: false,
    mutationFn: (input: ReceiptInput) => api.post<Receipt>(`/v1/shops/${shop}/purchase-receipts`, input),
    onSuccess: () => {
      for (const key of ['purchase-receipts', 'products', 'product', 'report']) {
        void client.invalidateQueries({ queryKey: [key, shop] })
      }
    },
  })
}
