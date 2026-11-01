import { PurchaseComposer } from '../purchases/composer/PurchaseComposer'
import { useToast } from '../components/ui/toastContext'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { formatMoney, formatQty } from '../lib/money'
import { useDebounced } from '../lib/useDebounced'
import { Alert, Empty, Loading } from '../components/ui/ui'
import { ActionMenu, Button, PageHeader, Toolbar } from '../components/ui/workspace'
import { can } from '../permissions'
import { useShop } from '../shops/context'
import { ImportDialog } from './components/ImportDialog'
import { Labels } from './components/Labels'
import { ListsManager } from './components/ListsManager'
import { ProductDetailPanel } from './components/ProductDetailPanel'
import { ProductForm } from './components/ProductForm'
import { downloadExport, PAGE_SIZE, useCategories, useProducts, type ProductQuery } from './queries'
import { describeError } from '../components/useAction'

type Sort = ProductQuery['sort']

function readQuery(params: URLSearchParams): ProductQuery {
  const sort = params.get('sort') as Sort | null
  return {
    q: params.get('q') ?? '',
    category: params.get('cat') ?? '',
    low: params.get('low') === '1',
    expiring: params.get('exp') === '1',
    sort: sort && ['name', 'price', 'quantity', 'updated', 'code'].includes(sort) ? sort : 'name',
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
    page: Math.max(0, Number(params.get('page')) || 0),
  }
}

export function ProductsPage() {
  const { current } = useShop()
  return <ProductsWorkspace key={current?.shop_id} />
}

function ProductsWorkspace() {
  const { current, role } = useShop()
  const navigate = useNavigate()
  const { id: selectedId } = useParams()
  const [params, setParams] = useSearchParams()
  const query = useMemo(() => readQuery(params), [params])
  const canEdit = can(role, 'products.edit')
  const canExport = can(role, 'data.export')
  const seeCost = canEdit // purchase-side fields only ever arrive for owner and admin

  const [search, setSearch] = useState(query.q)
  const settled = useDebounced(search, 300)
  const [dialog, setDialog] = useState<null | 'new' | 'import' | 'lists' | 'labels' | 'purchase'>(null)
  const toast = useToast()
  // A link from Home ("Add your first product") opens the form straight away.
  useEffect(() => {
    if (params.get('new') !== '1') return
    setDialog('new')
    const next = new URLSearchParams(params)
    next.delete('new')
    setParams(next, { replace: true })
  }, [params, setParams])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [exportError, setExportError] = useState<string | null>(null)

  const update = (changes: Record<string, string | null>, keepPage = false) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    if (!keepPage) next.delete('page')
    setParams(next, { replace: true })
  }

  useEffect(() => {
    if (settled !== query.q) update({ q: settled })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the settled text should trigger this
  }, [settled])

  const products = useProducts(query)
  const categories = useCategories()
  const data = products.data
  const filtered = !!(query.q || query.category || query.low || query.expiring)
  const emptyCatalogue = !!data && data.items.length === 0 && !filtered
  const total = data?.total ?? 0
  const open = (id: string | null) => navigate({ pathname: id ? `/products/${id}` : '/products', search: params.toString() })

  const sortBy = (sort: Sort) =>
    update({ sort, dir: query.sort === sort && query.dir === 'asc' ? 'desc' : 'asc' }, true)
  const arrow = (sort: Sort) => (query.sort === sort ? (query.dir === 'asc' ? ' ▲' : ' ▼') : '')
  const head = (sort: Sort, label: string) => (
    <th aria-sort={query.sort === sort ? (query.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className="th-button" onClick={() => sortBy(sort)}>
        {label}
        {arrow(sort)}
      </button>
    </th>
  )

  const togglePick = (id: string) =>
    setPicked((now) => {
      const next = new Set(now)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="split catalogue">
      <div className="split-main">
        <PageHeader eyebrow="INVENTORY" title="Products" description="Your catalogue, stock and pricing in one place." actions={<>
          {canEdit && <Button variant={emptyCatalogue ? undefined : 'primary'} onClick={() => setDialog('purchase')}>Record purchase</Button>}
          {canEdit && <Button variant={emptyCatalogue ? 'primary' : undefined} onClick={() => setDialog('new')}>Add product</Button>}
          {canEdit && <Button onClick={() => setDialog('import')}>Import</Button>}
          <Button disabled={picked.size === 0} onClick={() => setDialog('labels')}>Print labels{picked.size ? ` (${picked.size})` : ''}</Button>
          {(canEdit || canExport) && <ActionMenu>
            {canExport && <>
              <Button onClick={() => void downloadExport(current?.shop_id ?? '', 'csv').catch(e => setExportError(describeError(e)))}>Export CSV</Button>
              <Button onClick={() => void downloadExport(current?.shop_id ?? '', 'xlsx').catch(e => setExportError(describeError(e)))}>Export Excel</Button>
            </>}
            {canEdit && <Button onClick={() => setDialog('lists')}>Categories &amp; units</Button>}
          </ActionMenu>}
        </>} />
        {exportError && <Alert>{exportError}</Alert>}

        <div className="catalogue-heading"><h2>All products {data && <span className="count-badge">{total}</span>}</h2><span className="muted">{picked.size ? `${picked.size} selected` : 'Select products to print labels'}</span></div>
        <Toolbar label="Filter products">
          <input type="search" aria-label="Search products" placeholder="Search name, code or barcode" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label="Category" value={query.category} onChange={(e) => update({ cat: e.target.value })}>
            <option value="">All categories</option>
            {categories.data?.map((c) => (
              <option key={c.uuid} value={c.uuid}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="check inline">
            <input type="checkbox" checked={query.low} onChange={(e) => update({ low: e.target.checked ? '1' : null })} />
            Low stock
          </label>
          <label className="check inline">
            <input type="checkbox" checked={query.expiring} onChange={(e) => update({ exp: e.target.checked ? '1' : null })} />
            Expiring in 30 days
          </label>
          {(query.q || query.category || query.low || query.expiring) && <button className="link" onClick={() => { setSearch(''); update({ q: null, cat: null, low: null, exp: null }) }}>Clear filters</button>}
        </Toolbar>
        {categories.error && <Alert>Categories could not be loaded. <button className="link" onClick={() => void categories.refetch()}>Retry categories</button></Alert>}

        {products.isPending && <Loading />}
        {products.error && <Alert>{describeError(products.error)}</Alert>}
        {data && data.items.length === 0 && (
          <>
            <Empty title={filtered ? 'No products match' : 'No products yet'}>
              {filtered ? 'Try another search or clear the filters.' : canEdit ? 'Add your first product, or import a list from Excel or CSV.' : 'Ask the owner to add products.'}
            </Empty>
            {!filtered && canEdit && <div className="actions empty-actions"><Button variant="primary" onClick={() => setDialog('new')}>Add product</Button><Button onClick={() => setDialog('import')}>Import a file</Button></div>}
          </>
        )}
        {data && data.items.length > 0 && (
          <>
            <div className="table-wrap">
              <table className="table products" aria-busy={products.isFetching}>
                <thead>
                  <tr>
                    <th>
                      <span className="sr-only">Select</span>
                    </th>
                    {head('name', 'Product')}
                    <th>Category</th>
                    {head('price', 'Price')}
                    {seeCost && <th>Cost</th>}
                    {head('quantity', 'Stock')}
                    <th>Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => (
                    <tr key={p.uuid} className={p.uuid === selectedId ? 'selected' : undefined}>
                      <td>
                        <input type="checkbox" aria-label={`Select ${p.name}`} checked={picked.has(p.uuid)} onChange={() => togglePick(p.uuid)} />
                      </td>
                      <td>
                        <button className="link row-link" onClick={() => open(p.uuid)}>
                          {p.name}
                        </button>
                        <br />
                        <small className="muted">{[p.product_code, p.barcode].filter(Boolean).join(' · ')}</small>
                      </td>
                      <td>{p.category_name ?? '—'}</td>
                      <td>{formatMoney(p.selling_price)}</td>
                      {seeCost && <td>{formatMoney(p.purchase_price)}</td>}
                      <td>
                        {p.track_stock ? (
                          <>
                            {formatQty(p.quantity)} {p.unit_name ?? ''} {p.low_stock && <span className="badge warn">low</span>}
                          </>
                        ) : (
                          <span className="muted">not tracked</span>
                        )}
                      </td>
                      <td>{p.next_expiry ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span className="muted">
                {query.page * PAGE_SIZE + 1}–{query.page * PAGE_SIZE + data.items.length} of {total}
              </span>
              <button disabled={query.page === 0} onClick={() => update({ page: String(query.page - 1) }, true)}>
                Previous
              </button>
              <button disabled={!data.next_cursor} onClick={() => update({ page: String(query.page + 1) }, true)}>
                Next
              </button>
            </div>
          </>
        )}
      </div>

      {selectedId && <ProductDetailPanel id={selectedId} canEdit={canEdit} onClose={() => open(null)} />}
      {dialog === 'purchase' && <PurchaseComposer onClose={() => setDialog(null)} />}
      {dialog === 'new' && <ProductForm onClose={() => setDialog(null)} onSaved={(id) => { setDialog(null); open(id); toast('Product added') }} />}
      {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} />}
      {dialog === 'lists' && <ListsManager onClose={() => setDialog(null)} />}
      {dialog === 'labels' && <Labels ids={[...picked]} onClose={() => setDialog(null)} />}
    </div>
  )
}
