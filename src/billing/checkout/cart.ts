import { saleQuantity } from './quantity'
import { formatQty } from '../../lib/money'
import type { Product } from '../../products/queries'

export type DiscountMode = 'percent' | 'amount'
export type TaxMode = 'inclusive' | 'exclusive'
export type RoundOffMode = 'none' | 'nearest' | 'up' | 'down'

export interface CartItem {
  product: Product
  quantity: string
  discount_mode?: DiscountMode
  discount_value?: string
  tax_mode?: TaxMode | null
}

/** Most lines one invoice may carry (the API refuses more). */
export const MAX_LINES = 200

/** One more of a product: a quantity that is already in the cart goes up, never a second line. */
export function addOrIncrement(items: CartItem[], product: Product): { items: CartItem[]; quantity: string; added: boolean } {
  const at = items.findIndex(i => i.product.uuid === product.uuid)
  if (at < 0) return { items: [...items, { product, quantity: '1' }], quantity: '1', added: true }
  if (saleQuantity(items[at]!.quantity) === null) return { items, quantity: items[at]!.quantity, added: false }
  const quantity = String(Math.round((Number(items[at]!.quantity) + 1) * 10000) / 10000)
  return { items: items.map((row, n) => n === at ? { ...row, quantity } : row), quantity, added: false }
}

/** True when stock is tracked and nothing is left to sell. */
export function outOfStock(product: Product): boolean {
  return product.track_stock && product.quantity != null && Number(product.quantity) <= 0
}

/** A heads-up (not a block: the server decides at save) when the cart asks for more than the list showed. */
export function stockProblem(product: Product, quantity: string): string | null {
  if (!product.track_stock || product.quantity == null) return null
  if (Number(quantity) <= Number(product.quantity)) return null
  return `Only ${formatQty(product.quantity)}${product.unit_name ? ` ${product.unit_name}` : ''} in stock.`
}

/** "12 kg in stock" for pickers and cart lines; nothing when stock is not tracked. */
export function stockText(product: Product): string {
  if (!product.track_stock || product.quantity == null) return ''
  return outOfStock(product) ? 'Out of stock' : `${formatQty(product.quantity)}${product.unit_name ? ` ${product.unit_name}` : ''} in stock`
}
