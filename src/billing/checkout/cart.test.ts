import { describe, expect, it } from 'vitest'
import type { Product } from '../../products/queries'
import { addOrIncrement, outOfStock, stockProblem, stockText } from './cart'

const rice = { uuid: 'r', name: 'Rice', track_stock: true, quantity: '3', unit_name: 'kg' } as Product

describe('cart', () => {
  it('adds a new product as one line', () => {
    expect(addOrIncrement([], rice)).toEqual({ items: [{ product: rice, quantity: '1' }], quantity: '1', added: true })
  })
  it('raises the quantity of a product already in the cart instead of adding a second line', () => {
    const once = addOrIncrement([], rice).items
    const twice = addOrIncrement(once, rice)
    expect(twice.items).toHaveLength(1)
    expect(twice.quantity).toBe('2')
    expect(twice.added).toBe(false)
  })
  it('keeps a fractional quantity exact when one more is added', () => {
    expect(addOrIncrement([{ product: rice, quantity: '0.1' }], rice).quantity).toBe('1.1')
  })
  it('preserves invalid edited quantity when scanned again', () => {
    const items = [{ product: rice, quantity: '1e2' }]
    expect(addOrIncrement(items, rice)).toEqual({ items, quantity: '1e2', added: false })
  })
  it('preserves per-line discount and tax mode when incrementing an existing product', () => {
    const existing = [{ product: rice, quantity: '1', discount_mode: 'amount' as const, discount_value: '10', tax_mode: 'exclusive' as const }]
    const next = addOrIncrement(existing, rice)
    expect(next.items[0]).toEqual({ product: rice, quantity: '2', discount_mode: 'amount', discount_value: '10', tax_mode: 'exclusive' })
  })
  it('flags a request above the stock shown, only for tracked products', () => {
    expect(stockProblem(rice, '3')).toBeNull()
    expect(stockProblem(rice, '4')).toBe('Only 3 kg in stock.')
    expect(stockProblem({ ...rice, track_stock: false }, '99')).toBeNull()
  })
  it('describes stock for the picker', () => {
    expect(stockText(rice)).toBe('3 kg in stock')
    expect(stockText({ ...rice, quantity: '0' })).toBe('Out of stock')
    expect(outOfStock({ ...rice, quantity: '0' })).toBe(true)
    expect(stockText({ ...rice, track_stock: false })).toBe('')
  })
})
