import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { components } from '../api/schema'
import { api } from '../api/client'
import { downloadFile } from '../lib/download'
import { useShop } from '../shops/context'

type S = components['schemas']
export type Kpis = S['Kpis']
export type DayBook = S['DayBook']
export type ProfitLoss = S['ProfitLoss']
export type Ageing = S['Ageing']
export type Expiring = S['Expiring']
export type Purchases = S['Purchases']
export type TaxSummary = S['TaxSummary']
export type StockValuation = S['StockValuation']
export type Gstr1 = S['Gstr1']

export type ReportName =
  | 'kpis'
  | 'day-book'
  | 'profit-loss'
  | 'receivables-ageing'
  | 'expiring-stock'
  | 'purchase-register'
  | 'tax-summary'
  | 'stock-valuation'
  | 'gstr1'

function path(shop: string, name: string, params: Record<string, string>, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams({ ...params, ...extra })
  const text = query.toString()
  return `/v1/shops/${shop}/reports/${name}${text ? `?${text}` : ''}`
}

/** One report, refetched when its dates change; the previous numbers stay visible meanwhile. */
export function useReport<T>(name: ReportName, params: Record<string, string>, enabled = true) {
  const shop = useShop().current?.shop_id ?? ''
  return useQuery({
    queryKey: ['report', shop, name, params],
    queryFn: () => api.get<T>(path(shop, name, params)),
    enabled: !!shop && enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

/** Saves a report as CSV or Excel (the GSTR-1 workbook is always Excel). */
export function useReportDownload(name: ReportName, params: Record<string, string>) {
  const shop = useShop().current?.shop_id ?? ''
  return (format: 'csv' | 'xlsx') => {
    const stamp = params.to ?? params.day ?? params.as_of ?? new Date().toISOString().slice(0, 10)
    if (name === 'gstr1') {
      return downloadFile(path(shop, 'gstr1.xlsx', params), `GSTR1_${params.from ?? ''}.xlsx`)
    }
    return downloadFile(path(shop, name, params, { format }), `${name}_${stamp}.${format}`)
  }
}
