import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/context'
import type { Role, Shop } from '../api/types'
import { ShopContext, type ShopValue } from './context'

import { remembered, rememberShop } from './selection'

export function ShopProvider({ children }: { children: ReactNode }) {
  const userId = useAuth().user?.id ?? ''
  return <AccountShopProvider key={userId} userId={userId}>{children}</AccountShopProvider>
}

function AccountShopProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const [selected, setSelected] = useState(() => remembered(userId))
  const query = useQuery({ queryKey: ['shops'], queryFn: () => api.get<Shop[]>('/v1/shops') })

  const { data, isPending, error, refetch } = query
  const value = useMemo<ShopValue>(() => {
    const shops = data ?? []
    const current = shops.find((s) => s.shop_id === selected) ?? shops[0] ?? null
    return {
      shops,
      current,
      role: (current?.role as Role | undefined) ?? null,
      loading: isPending,
      error,
      select: (shopId) => {
        setSelected(shopId)
        rememberShop(userId, shopId)
      },
      refresh: () => refetch(),
    }
  }, [data, isPending, error, refetch, selected, userId])

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
}
