import { createContext, useContext } from 'react'
import type { Role, Shop } from '../api/types'

export interface ShopValue {
  shops: Shop[]
  current: Shop | null
  role: Role | null
  loading: boolean
  error: Error | null
  select: (shopId: string) => void
  refresh: () => Promise<unknown>
}

export const ShopContext = createContext<ShopValue | null>(null)

export function useShop(): ShopValue {
  const value = useContext(ShopContext)
  if (!value) throw new Error('useShop must be used inside ShopProvider')
  return value
}
