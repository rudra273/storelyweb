export interface ShopAccessEvent { shopId: string; membership: boolean; roleOnly?: boolean }
const listeners = new Set<(event: ShopAccessEvent) => void>()
export function subscribeShopAccess(listener: (event: ShopAccessEvent) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function reportShopAccess(event: ShopAccessEvent) {
  for (const listener of listeners) listener(event)
}
