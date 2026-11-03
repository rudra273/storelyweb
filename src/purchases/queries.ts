import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, request } from '../api/client'
import type { components } from '../api/schema'
import { useShop } from '../shops/context'
import type { ImportPreview, Receipt, ReceiptInput } from './composer/contracts'

export type PurchaseSummary = components['schemas']['PurchaseSummary']
export const RECEIPT_PAGE_SIZE = 25

/** What narrows the purchase list. The same filters narrow the summary, so the two always agree. */
export interface ReceiptFilters { supplier: string; q: string; status: string; overdue: boolean; from: string; to: string }
export const NO_FILTERS: ReceiptFilters = { supplier: '', q: '', status: '', overdue: false, from: '', to: '' }

function filterParams(f: ReceiptFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (f.supplier) params.set('supplier', f.supplier)
  if (f.q.trim()) params.set('q', f.q.trim())
  if (f.status) params.set('status', f.status)
  if (f.overdue) params.set('overdue', 'true')
  if (f.from) params.set('from', f.from)
  if (f.to) params.set('to', f.to)
  return params
}

export function useReceipts(f: ReceiptFilters, page: number) {
  const shop = useShop().current?.shop_id ?? ''
  const params = filterParams(f)
  params.set('limit', String(RECEIPT_PAGE_SIZE))
  params.set('offset', String(page * RECEIPT_PAGE_SIZE))
  return useQuery({ queryKey: ['purchase-receipts', shop, params.toString()], enabled: !!shop,
    queryFn: () => api.get<Receipt[]>(`/v1/shops/${shop}/purchase-receipts?${params}`) })
}

/** Purchases and payments in the dates chosen, plus what is owed and overdue today. */
export function usePurchaseSummary(f: ReceiptFilters) {
  const shop = useShop().current?.shop_id ?? ''
  const params = filterParams({ ...f, q: '', status: '', overdue: false })
  return useQuery({ queryKey: ['purchase-summary', shop, params.toString()], enabled: !!shop,
    queryFn: () => api.get<PurchaseSummary>(`/v1/shops/${shop}/purchase-receipts/summary?${params}`) })
}

export function useReceipt(id: string | undefined) {
  const shop = useShop().current?.shop_id ?? ''
  return useQuery({ queryKey: ['purchase-receipt', shop, id], enabled: !!shop && !!id,
    queryFn: () => api.get<Receipt>(`/v1/shops/${shop}/purchase-receipts/${id}`) })
}

/** Everything that shows a purchase, a balance owed or stock refreshes after a purchase or a payment. */
export const PURCHASE_VIEWS = ['purchase-receipts', 'purchase-receipt', 'purchase-summary', 'suppliers', 'supplier-statement', 'supplier-detail']

export function useConfirmReceipt() {
  const shop = useShop().current?.shop_id ?? ''
  const client = useQueryClient()
  return useMutation({ retry: false,
    mutationFn: (input: ReceiptInput) => api.post<Receipt>(`/v1/shops/${shop}/purchase-receipts`, input),
    onSuccess: () => {
      for (const key of [...PURCHASE_VIEWS, 'products', 'product', 'report', 'categories', 'units']) {
        void client.invalidateQueries({ queryKey: [key, shop] })
      }
    },
  })
}

export function previewPurchaseImport(shop: string, file: File): Promise<ImportPreview> {
  const query = new URLSearchParams({ filename: file.name })
  return request<ImportPreview>('POST', `/v1/shops/${shop}/purchase-receipts/import-preview?${query}`, { body: file })
}
