import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { ApiError, api } from '../../api/client'
import { describeError } from '../../components/useAction'
import { formatMoney } from '../../lib/money'
import { useDebounced } from '../../lib/useDebounced'
import { useProducts, useCategories, type Product, type ProductPage } from '../../products/queries'
import { useShop } from '../../shops/context'
import { outOfStock, stockText } from './cart'
import type { Status } from './scanStatus'

/**
 * The first thing a cashier uses: type to search, or scan a barcode. A keyboard-wedge scanner
 * types the code and presses Enter, so Enter always means "this exact code first": an exact
 * barcode or product code wins over a name search, and a code that matches nothing is never
 * guessed. Pressing Enter on an empty box moves on to payment.
 */
export function ScanBox({ status, onStatus, onProduct, onUnknown, onDone, disabled }: {
  /** Held by the parent so something added outside the box (a product just created) can report too. */
  status: Status
  onStatus: (status: Status) => void
  /** Puts the product in the cart and says what happened, so the cashier sees it without looking away. */
  onProduct: (product: Product, how: 'scan' | 'pick') => Status
  onUnknown: (code: string) => void
  onDone: () => void
  disabled: boolean
}) {
  const shop = useShop().current?.shop_id ?? ''
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [category, setCategory] = useState('')
  const setStatus = onStatus
  // Scans are looked up one after another so a fast scanner can never reorder or drop a code.
  const queue = useRef<Promise<void>>(Promise.resolve())
  const search = useDebounced(text, 200)
  const categories = useCategories()
  const searching = search.trim() !== '' || category !== ''
  const results = useProducts({ q: search.trim(), category, low: false, expiring: false, sort: 'name', dir: 'asc', page: 0 })

  async function resolve(code: string) {
    const base = `/v1/shops/${shop}/products`
    try {
      setStatus(onProduct(await api.get<Product>(`${base}/lookup?code=${encodeURIComponent(code)}`), 'scan'))
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) {
        setStatus({ kind: 'error', text: describeError(error) })
        return
      }
      // Not an exact code: a one-match name search is still a clear answer.
      try {
        const found = await api.get<ProductPage>(`${base}?q=${encodeURIComponent(code)}&limit=6`)
        if (found.items.length === 1) setStatus(onProduct(found.items[0]!, 'pick'))
        else if (found.items.length > 1) setStatus({ kind: 'warn', text: `${found.total} products match “${code}”. Choose one below.` })
        else { setStatus({ kind: 'warn', text: `No product has the barcode or code ${code}.` }); onUnknown(code) }
      } catch (searchError) {
        setStatus({ kind: 'error', text: describeError(searchError) })
      }
    }
  }

  function keyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape' && text) { setText(''); setStatus({ kind: 'ready', text: 'Cleared' }); return }
    if (e.key !== 'Enter') return
    e.preventDefault()
    const code = text.trim()
    // Wait for scans still being looked up, so "scan, scan, Enter" lands on the finished cart.
    if (!code) { queue.current = queue.current.then(onDone); return }
    setText('')
    setStatus({ kind: 'ready', text: `Looking up ${code}…` })
    queue.current = queue.current.then(() => resolve(code))
  }

  function pick(product: Product) {
    setStatus(onProduct(product, 'pick'))
    setText('')
    input.current?.focus()
  }

  return <div className="scan-box">
    <div className="scan-entry">
      <label htmlFor={id}>Scan barcode or search products</label>
      <input ref={input} id={id} type="text" autoFocus autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={disabled}
        placeholder="Scan, or type a name or code" aria-describedby={`${id}-help ${id}-status`}
        value={text} onChange={e => setText(e.target.value)} onKeyDown={keyDown} />
      <span className="scan-mode" title="A USB or Bluetooth barcode scanner types the code like a keyboard"><span className="scan-dot" aria-hidden="true" />Scanner ready</span>
    </div>
    <p id={`${id}-status`} className={`scan-status scan-${status.kind}`} role="status" aria-live="polite">{status.text}</p>
    <details className="scan-help"><summary id={`${id}-help`}>Using a barcode scanner?</summary>
      <p>Click the box above, then scan. USB and Bluetooth scanners that type like a keyboard work here, and scanning a product again adds one more. Press <kbd>Enter</kbd> on an empty box to go to payment, <kbd>Esc</kbd> to clear it.</p>
    </details>
    <div className="chip-row" role="group" aria-label="Browse by category">
      <button type="button" className="chip" aria-pressed={category === ''} onClick={() => setCategory('')}>All</button>
      {categories.data?.slice(0, 10).map(c => <button type="button" key={c.uuid} className="chip" aria-pressed={category === c.uuid} onClick={() => setCategory(category === c.uuid ? '' : c.uuid)}>{c.name}</button>)}
    </div>
    {searching && <div className="picker" aria-label="Matching products">
      {results.isPending && <p className="muted">Searching…</p>}
      {results.error && <p className="field-error" role="alert">{describeError(results.error)}</p>}
      {results.data && !results.data.items.length && <p className="muted">No product matches. Press Enter to try it as a barcode.</p>}
      {results.data && results.data.items.length > 0 && <ul className="plain">{results.data.items.map(p => <li key={p.uuid}>
        <button type="button" disabled={outOfStock(p)} onClick={() => pick(p)}>
          <span className="picker-name">{p.name}<small className="muted">{[p.barcode || p.product_code, stockText(p)].filter(Boolean).join(' · ')}</small></span>
          <span className="picker-price">{formatMoney(p.selling_price)}</span>
        </button></li>)}</ul>}
      {results.data?.next_cursor && <p className="muted">Showing the first {results.data.items.length} of {results.data.total}. Type more to narrow it.</p>}
    </div>}
  </div>
}
