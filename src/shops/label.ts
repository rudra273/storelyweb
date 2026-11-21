import type { Shop } from '../api/types'

/** A short code from the shop's id, so two shops with one name can still be told apart. */
export function shopCode(shop: Pick<Shop, 'shop_id'>): string {
  return shop.shop_id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()
}

/** The shop's name, with its code added only when another shop of yours shares the name. */
export function shopLabel(shop: Shop, all: Shop[]): string {
  const same = all.filter(s => s.name.trim().toLowerCase() === shop.name.trim().toLowerCase()).length > 1
  return same ? `${shop.name} · ${shopCode(shop)}` : shop.name
}
