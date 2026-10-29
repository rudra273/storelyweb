import { createContext, useContext } from 'react'
import type { components } from '../api/schema'
export type Entitlement = components['schemas']['EntitlementOut']
export interface ShopAccess {
  active: boolean
  pending: boolean
  error: Error | null
  entitlement: Entitlement | undefined
  refresh: () => void
}
export const AccessContext = createContext<ShopAccess | null>(null)
export function useShopAccess() {
  const value = useContext(AccessContext)
  if (!value) throw new Error('Shop access must be checked before rendering business screens')
  return value
}
