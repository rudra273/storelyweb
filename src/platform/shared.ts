import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { components } from '../api/schema'

export type Schemas = components['schemas']
export const PAGE = 25
export function usePlatform<T>(path: string) {
  return useQuery({ queryKey: ['platform', path], queryFn: () => api.get<T>(`/v1/platform${path}`), retry: false })
}
export function useRefreshPlatform() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: ['platform'] })
}
export function date(value: string | null | undefined) { return value ? new Date(value).toLocaleString() : '—' }
export function localDate(value: string | null | undefined) {
  if (!value) return ''
  const d = new Date(value)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
