import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import type { Role, Shop } from '../api/types'
import { ShopContext, type ShopValue } from './context'

const KEY = 'storely.shop'

// Which shop was last open is a convenience, not a secret, so localStorage is fine.
// It can be blocked or empty, so it is always read and written defensively.
function remembered(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(remembered)
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
        try {
          localStorage.setItem(KEY, shopId)
        } catch {
          // the choice just will not be remembered
        }
      },
      refresh: () => refetch(),
    }
  }, [data, isPending, error, refetch, selected])

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
}
