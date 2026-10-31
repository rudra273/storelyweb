import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api, ApiError } from '../api/client'
import { subscribeShopAccess } from '../api/shopAccessEvents'
import { useShop } from '../shops/context'
import { AccessContext, type Entitlement } from './context'

/** Business caches contain tenant data; clear them when access is lost. */
export function AccessProvider({ children }: { children: ReactNode }) {
  const { current } = useShop()
  const shop = current?.shop_id ?? ''
  const client = useQueryClient()
  const [blockedGeneration, setBlockedGeneration] = useState<number | null>(null)
  const generation = useRef(0)
  const query = useQuery({ queryKey: ['entitlement', shop], queryFn: async () => { const received = Date.now(); const value = await api.get<Entitlement>(`/v1/shops/${encodeURIComponent(shop)}/entitlement`); return { value, received, generation: ++generation.current } }, enabled: !!shop, staleTime: 60_000, refetchInterval: 60_000, retry: false })
  const blocked = blockedGeneration !== null && blockedGeneration === (query.data?.generation ?? 0)
  const value = query.data?.value
  const active = !!value?.web_access && value.shop_id === shop && !blocked && !query.error
  useEffect(() => subscribeShopAccess(event => {
    if (event.shopId !== shop) return
    if (event.roleOnly) {
      void client.invalidateQueries({ queryKey: ['shops'] })
      return
    }
    setBlockedGeneration(query.data?.generation ?? 0)
    void client.invalidateQueries({ queryKey: ['entitlement', shop] })
    if (event.membership) void client.invalidateQueries({ queryKey: ['shops'] })
  }), [client, shop, query.data?.generation])
  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 404) {
      void client.invalidateQueries({ queryKey: ['shops'] })
    }
  }, [client, query.error])
  useEffect(() => {
    if (!query.data || query.error) return
    // Query success is authoritative; use the server clock to handle local skew.
    const { value: state, received } = query.data
    const nextBoundary = state.effective_status === 'scheduled' ? state.starts_at : state.web_access ? state.ends_at : null
    if (!nextBoundary) return
    const remaining = new Date(nextBoundary).getTime() - new Date(state.server_time).getTime() - (Date.now() - received)
    const timer = setTimeout(() => {
      setBlockedGeneration(query.data?.generation ?? 0)
      void client.invalidateQueries({ queryKey: ['entitlement', shop] })
    }, Math.max(0, Math.min(remaining, 2_147_483_647)))
    return () => clearTimeout(timer)
  }, [client, shop, query.data, query.error])
  useEffect(() => {
    if (active) return
    const filter = { predicate: (q: { queryKey: readonly unknown[] }) => q.queryKey[0] !== 'entitlement' && q.queryKey[1] === shop }
    void client.cancelQueries(filter)
    client.removeQueries(filter)
  }, [active, client, shop])
  useEffect(() => () => {
    const filter = { predicate: (q: { queryKey: readonly unknown[] }) => q.queryKey[0] !== 'entitlement' && q.queryKey[1] === shop }
    void client.cancelQueries(filter)
    client.removeQueries(filter)
  }, [client, shop])
  return <AccessContext.Provider value={{ active, pending: query.isPending || (blocked && query.isFetching), error: query.error, entitlement: value, refresh: () => { setBlockedGeneration(query.data?.generation ?? 0); void query.refetch() } }}>{children}</AccessContext.Provider>
}
