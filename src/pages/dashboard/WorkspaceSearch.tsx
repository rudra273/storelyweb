import { useId, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import type { components } from '../../api/schema'
import { api } from '../../api/client'
import { useAuth } from '../../auth/context'
import { Alert, Empty, Field, Loading } from '../../components/ui/ui'
import { describeError } from '../../components/useAction'
import { stockText } from '../../billing/checkout/cart'
import { useDebounced } from '../../lib/useDebounced'
import { formatMoney } from '../../lib/money'
import { useShopAccess } from '../../subscriptions/context'
import { can } from '../../permissions'
import { useShop } from '../../shops/context'
import type { Product, ProductPage } from '../../products/queries'
import type { BillPage } from '../../billing/queries'

type CustomerPage = components['schemas']['CustomerPage']
type Customer = CustomerPage['items'][number]
type Bill = BillPage['items'][number]
interface SearchQuery<T> { data?: { items: T[] }; error: Error | null; isPending: boolean; isFetching: boolean; refetch: () => unknown }

/** Home search is ephemeral: a new account/shop/role starts with an empty field. */
export function WorkspaceSearch({ children }: { children: ReactNode }) {
  const user = useAuth().user?.id ?? ''
  const { current, role } = useShop()
  const { active } = useShopAccess()
  return <ScopedSearch key={JSON.stringify([user, current?.shop_id, role, active])} user={user} shop={current?.shop_id ?? ''} role={role} ready={active}>{children}</ScopedSearch>
}

function ScopedSearch({ children, user, shop, role, ready }: { children: ReactNode; user: string; shop: string; role: string | null; ready: boolean }) {
  const [text, setText] = useState('')
  const input = text.trim()
  const settled = useDebounced(input, 250)
  const id = useId()
  const form = useRef<HTMLFormElement>(null)
  const allowed = { products: can(role, 'products.view'), bills: can(role, 'billing.create'), customers: can(role, 'customers.view') }
  const valid = input.length <= 60
  const enabled = ready && !!user && !!shop && input !== '' && input === settled && valid
  const params = new URLSearchParams({ q: input, workspace_search: 'true', limit: '5' })
  const base = `/v1/shops/${encodeURIComponent(shop)}`
  // Raw input in the key detaches/aborts the old observer before debounce completes.
  const scope = ['workspace-search', user, shop, role, input]
  const products = useQuery({ queryKey: [...scope, 'products'], queryFn: ({ signal }) => api.get<ProductPage>(`${base}/products?${params}`, { signal }), enabled: enabled && allowed.products, retry: false, staleTime: 0 })
  const bills = useQuery({ queryKey: [...scope, 'bills'], queryFn: ({ signal }) => api.get<BillPage>(`${base}/bills?${params}`, { signal }), enabled: enabled && allowed.bills, retry: false, staleTime: 0 })
  const customers = useQuery({ queryKey: [...scope, 'customers'], queryFn: ({ signal }) => api.get<CustomerPage>(`${base}/customers/accounts?${params}`, { signal }), enabled: enabled && allowed.customers, retry: false, staleTime: 0 })
  const queries = [allowed.products ? products : null, allowed.bills ? bills : null, allowed.customers ? customers : null].filter(query => query !== null)
  const empty = queries.length > 0 && queries.every(query => !query.error && !query.isPending && !query.isFetching && query.data?.items.length === 0)
  function clear() { setText(''); form.current?.querySelector<HTMLInputElement>('input')?.focus() }
  return <>
    <section className="card" aria-label="Workspace search">
      <form ref={form} role="search" onSubmit={event => event.preventDefault()} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); clear() } }}>
        <Field label="Search workspace" type="search" placeholder="Products, invoices or customers" maxLength={60} value={text} onChange={event => setText(event.target.value)} disabled={!ready || !queries.length} error={!valid ? 'Search can be up to 60 characters.' : undefined} aria-controls={input && valid ? id : undefined} hint="Search a name, code, invoice number or customer detail." />
        {text && <button type="button" className="link" onClick={clear}>Clear workspace search</button>}
      </form>
    </section>
    {!input ? children : valid && <section className="card" id={id} aria-label="Workspace search results" aria-live="polite">
      <h2>Search results</h2>
      {input !== settled ? <Loading label="Searching workspace…" /> : empty ? <Empty title="No matching products, invoices or customers">Try another name, code or customer detail.</Empty> : <>
        <p className="muted">Up to five matches per area. Choose a record to open it.</p>
        {allowed.products && <SearchSection<Product> name="Products" query={products}>{product => <Link className="row" to={`/products/${encodeURIComponent(product.uuid)}`} state={{ from: '/' }}><span><strong>{product.name}</strong><br /><small>Product · {stockText(product) || 'Stock not tracked'}</small></span><span>{formatMoney(product.selling_price)}</span></Link>}</SearchSection>}
        {allowed.bills && <SearchSection<Bill> name="Invoices" query={bills}>{bill => <Link className="row" to={`/billing/${encodeURIComponent(bill.uuid)}`} state={{ from: '/' }}><span><strong>{bill.bill_number.replace(/^SHOP-LOCAL-local-/, 'INV-')}</strong><br /><small>{bill.document_type === 'credit_note' ? 'Credit note' : 'Invoice'} · {bill.customer_name}</small></span><span>{formatMoney(bill.total_amount)}</span></Link>}</SearchSection>}
        {allowed.customers && <SearchSection<Customer> name="Customers" query={customers}>{customer => <Link className="row" to={`/customers/${encodeURIComponent(customer.uuid)}`} state={{ from: '/' }}><span><strong>{customer.name}</strong><br /><small>Customer{customer.phone ? ` · ${customer.phone}` : ''}</small></span><span>Balance due {formatMoney(customer.due)}</span></Link>}</SearchSection>}
      </>}
    </section>}
  </>
}

function SearchSection<T extends { uuid: string }>({ name, query, children }: { name: string; query: SearchQuery<T>; children: (item: T) => ReactNode }) {
  return <section aria-label={`${name} search results`}>
    <h3>{name}</h3>
    {query.isPending || query.isFetching ? <Loading label={`Searching ${name.toLowerCase()}…`} /> : query.error ? <Alert>{name} search could not be loaded. {describeError(query.error)} <button type="button" className="link" onClick={() => void query.refetch()}>Retry {name.toLowerCase()} search</button></Alert> : !query.data?.items.length ? <p className="muted">No {name.toLowerCase()} match.</p> : <ul className="plain">{query.data.items.map(item => <li key={item.uuid}>{children(item)}</li>)}</ul>}
  </section>
}
