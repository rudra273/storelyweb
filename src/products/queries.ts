import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
export type Supplier = S['SupplierOut']
export type ImportReport = S['ImportReport']
export type PriceInput = S['PricePreviewIn']
export type PricePreview = S['PricePreviewOut']
export type BulkResult = S['BulkOut']
export type BulkScope = S['BulkScope']
export type BulkAction = S['SetCategory'] | S['SetReorderLevel'] | S['PriceChange'] | S['Archive'] | S['AssignCodes']
export type LabelProduct = S['LabelProduct']
export type StockSummary = S['StockSummary']
export type LedgerEntry = S['LedgerEntry']
export type LedgerPage = S['LedgerPage']

/** GST slabs offered for products and categories. */
export const GST_RATES = ['0', '0.25', '3', '5', '12', '18', '28', '40']

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
  /** Products with neither a barcode nor a code of their own. */
  noCode: boolean
  /** Tracked products with nothing on the shelf. */
  out: boolean
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
  if (query.noCode) params.set('no_code', 'true')
  if (query.out) params.set('out_of_stock', 'true')
  if (query.page > 0) params.set('cursor', String(query.page * PAGE_SIZE))
  return useQuery({
    queryKey: ['products', shop, params.toString()],
    queryFn: () => api.get<ProductPage>(`/v1/shops/${shop}/products?${params}`),
    enabled: !!shop,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === shop ? previous : undefined,
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

export function useSuppliers() {
  const shop = useShopId()
  return useQuery({ queryKey: ['suppliers', shop], queryFn: () => api.get<Supplier[]>(`/v1/shops/${shop}/suppliers`), enabled: !!shop })
}

export const saveSupplier = (shop: string, input: { id?: string; body: S['SupplierIn'] }) =>
  input.id
    ? api.patch<Supplier>(`/v1/shops/${shop}/suppliers/${input.id}`, input.body)
    : api.post<Supplier>(`/v1/shops/${shop}/suppliers`, input.body)

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
        client.invalidateQueries({ queryKey: ['suppliers', shop] }),
      ])
    },
  })
}

// `retryKey` makes a repeated Add product (after a lost response) return the same product.
export const saveProduct = (shop: string, input: { id?: string; body: Record<string, unknown>; retryKey?: string }) =>
  input.id
    ? api.patch<ProductDetail>(`/v1/shops/${shop}/products/${input.id}`, input.body)
    : request<ProductDetail>('POST', `/v1/shops/${shop}/products`, { body: input.body, idempotencyKey: input.retryKey })

export const removeProduct = (shop: string, id: string) => api.delete<void>(`/v1/shops/${shop}/products/${id}?confirm=true`)

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

/** The price a product would sell at, worked out on the server exactly as billing will. */
export function usePricePreview(input: PriceInput | null) {
  const shop = useShopId()
  return useQuery({
    queryKey: ['price-preview', shop, input],
    queryFn: () => api.post<PricePreview>(`/v1/shops/${shop}/products/price-preview`, input),
    enabled: !!shop && !!input,
    placeholderData: previous => previous,
    retry: false,
  })
}

/** What a bulk change would do, worked out by the server; nothing is written. */
export const reviewBulk = (shop: string, input: { scope: BulkScope; action: BulkAction }) =>
  api.post<BulkResult>(`/v1/shops/${shop}/products/bulk`, { ...input, dry_run: true })

/** Applies the change that was reviewed. The server refuses it if the products changed since (`fingerprint`). */
export const applyBulk = (shop: string, input: { scope: BulkScope; action: BulkAction; review: BulkResult; key: string }) =>
  request<BulkResult>('POST', `/v1/shops/${shop}/products/bulk`, {
    body: { scope: input.scope, action: input.action, dry_run: false, expected: { matched: input.review.matched, will_change: input.review.will_change, fingerprint: input.review.fingerprint } },
    idempotencyKey: input.key,
  })

/** Name, code, barcode and price for each product in a selection, as they are now. */
export const fetchLabelData = (shop: string, scope: BulkScope) => api.post<LabelProduct[]>(`/v1/shops/${shop}/products/label-data`, { scope })

/** How many products are low, out of stock, expiring or without a code. */
export function useStockSummary() {
  const shop = useShopId()
  return useQuery({ queryKey: ['products', shop, 'summary'], queryFn: () => api.get<StockSummary>(`/v1/shops/${shop}/products/stock-summary`), enabled: !!shop })
}

export interface LedgerFilters { from: string; to: string; type: string }

/** A product's whole stock history, a page at a time (newest first), with the balance after each entry. */
export function useLedger(id: string, f: LedgerFilters) {
  const shop = useShopId()
  return useInfiniteQuery({
    queryKey: ['product', shop, id, 'ledger', f],
    initialPageParam: '',
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '25' })
      if (f.from) params.set('from', f.from)
      if (f.to) params.set('to', f.to)
      if (f.type) params.set('type', f.type)
      if (pageParam) params.set('cursor', pageParam)
      return api.get<LedgerPage>(`/v1/shops/${shop}/products/${id}/movements?${params}`)
    },
    getNextPageParam: last => last.next_cursor ?? undefined,
    enabled: !!shop && !!id,
  })
}
