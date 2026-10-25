import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { components } from '../api/schema'
import { ApiError, api, request } from '../api/client'
import { downloadFile } from '../lib/download'
import { useShop } from '../shops/context'

type S = components['schemas']
export type Product = S['ProductOut']
export type ProductPage = S['ProductPage']
export type ProductDetail = S['ProductDetail']
export type Category = S['CategoryOut']
export type Unit = S['UnitOut']
export type ImportReport = S['ImportReport']

export const REASONS: { value: S['AdjustIn']['reason']; label: string; removes: boolean }[] = [
  { value: 'damage', label: 'Damaged', removes: true },
  { value: 'expired', label: 'Expired', removes: true },
  { value: 'theft', label: 'Lost / theft', removes: true },
  { value: 'own_use', label: 'Own use', removes: true },
  { value: 'return', label: 'Customer return', removes: false },
  { value: 'count', label: 'Stock count corrected', removes: false },
  { value: 'other', label: 'Other', removes: false },
]

export interface ProductQuery {
  q: string
  category: string
  low: boolean
  expiring: boolean
  sort: 'name' | 'price' | 'quantity' | 'updated' | 'code'
  dir: 'asc' | 'desc'
  page: number
}
export const PAGE_SIZE = 25

function useShopId(): string {
  return useShop().current?.shop_id ?? ''
}

export function useProducts(query: ProductQuery) {
  const shop = useShopId()
  const params = new URLSearchParams({ sort: query.sort, direction: query.dir, limit: String(PAGE_SIZE) })
  if (query.q) params.set('q', query.q)
  if (query.category) params.set('category', query.category)
  if (query.low) params.set('low_stock', 'true')
  if (query.expiring) params.set('expiring_days', '30')
  if (query.page > 0) params.set('cursor', String(query.page * PAGE_SIZE))
  return useQuery({
    queryKey: ['products', shop, params.toString()],
    queryFn: () => api.get<ProductPage>(`/v1/shops/${shop}/products?${params}`),
    enabled: !!shop,
    placeholderData: keepPreviousData,
  })
}

export function useProduct(id: string | undefined) {
  const shop = useShopId()
  return useQuery({
    queryKey: ['product', shop, id],
    queryFn: () => api.get<ProductDetail>(`/v1/shops/${shop}/products/${id}`),
    enabled: !!shop && !!id,
  })
}

export function useCategories() {
  const shop = useShopId()
  return useQuery({ queryKey: ['categories', shop], queryFn: () => api.get<Category[]>(`/v1/shops/${shop}/categories`), enabled: !!shop })
}

export function useUnits() {
  const shop = useShopId()
  return useQuery({ queryKey: ['units', shop], queryFn: () => api.get<Unit[]>(`/v1/shops/${shop}/units`), enabled: !!shop })
}

/** Anything that changes products or stock refreshes every product view. */
export function useProductMutation<TIn, TOut>(run: (shop: string, input: TIn) => Promise<TOut>) {
  const shop = useShopId()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: TIn) => run(shop, input),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['products', shop] }),
        client.invalidateQueries({ queryKey: ['product', shop] }),
        client.invalidateQueries({ queryKey: ['categories', shop] }),
        client.invalidateQueries({ queryKey: ['units', shop] }),
      ])
    },
  })
}

export const saveProduct = (shop: string, input: { id?: string; body: Record<string, unknown> }) =>
  input.id
    ? api.patch<ProductDetail>(`/v1/shops/${shop}/products/${input.id}`, input.body)
    : api.post<ProductDetail>(`/v1/shops/${shop}/products`, input.body)

export const removeProduct = (shop: string, id: string) => api.delete<void>(`/v1/shops/${shop}/products/${id}`)

export const adjustStock = (shop: string, input: { id: string; delta: string; reason: string; note: string | null }) =>
  api.post<{ quantity: string }>(`/v1/shops/${shop}/products/${input.id}/stock-adjustments`, {
    delta: input.delta,
    reason: input.reason,
    note: input.note,
  })

/** Sends the chosen file as the raw request body; the server reads CSV and .xlsx. */
export async function importFile(shop: string, file: File, options: { dryRun: boolean; allowDuplicate: boolean }): Promise<ImportReport> {
  const query = new URLSearchParams({ filename: file.name, dry_run: String(options.dryRun), allow_duplicate: String(options.allowDuplicate) })
  return request<ImportReport>('POST', `/v1/shops/${shop}/products/import?${query}`, { body: file })
}

/** Downloads the export through the normal authenticated request, then saves it. */
export function downloadExport(shop: string, format: 'csv' | 'xlsx'): Promise<void> {
  return downloadFile(`/v1/shops/${shop}/products/export?format=${format}`, `products_${new Date().toISOString().slice(0, 10)}.${format}`)
}

export { ApiError }
