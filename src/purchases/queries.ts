import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, request } from '../api/client'
import { useShop } from '../shops/context'
import type { ImportPreview, Receipt, ReceiptInput } from './contracts'

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
      for (const key of ['purchase-receipts', 'suppliers', 'supplier-statement', 'products', 'product', 'report', 'categories', 'units']) {
        void client.invalidateQueries({ queryKey: [key, shop] })
      }
    },
  })
}

export function previewPurchaseImport(shop: string, file: File): Promise<ImportPreview> {
  const query = new URLSearchParams({ filename: file.name })
  return request<ImportPreview>('POST', `/v1/shops/${shop}/purchase-receipts/import-preview?${query}`, { body: file })
}
