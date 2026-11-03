import { PurchaseComposer } from '../purchases/composer/PurchaseComposer'
import { useToast } from '../components/ui/toastContext'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
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
import { ProductRow } from './components/ProductRow'
import { BulkDialog, type BulkKind } from './components/BulkDialog'
import { TriCheckbox } from './components/TriCheckbox'
import { BULK_LIMIT, NONE, liveSelection, pageState, scopeOf, selectAllMatching, selectedCount, toggleOne, togglePage, type Filters, type Selection } from './selection'
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
    noCode: params.get('nocode') === '1',
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
  const [selection, setSelection] = useState<Selection>(NONE)
  const [bulk, setBulk] = useState<BulkKind | null>(null)
  // The product just added: its details open with the label offered straight away.
  const [added, setAdded] = useState<string | null>(null)
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
  const filtered = !!(query.q || query.category || query.low || query.expiring || query.noCode)
  const filters: Filters = { q: query.q, category: query.category, low: query.low, expiring: query.expiring, noCode: query.noCode }
  // A selection belongs to the filters it was made under: change them and it no longer applies.
  const sel = liveSelection(selection, filters)
  const lostCount = selection.kind !== 'none' && sel.kind === 'none' ? selectedCount(selection) : 0
  const chosen = selectedCount(sel)
  const visibleIds = data?.items.map(p => p.uuid) ?? []
  const state = pageState(sel, visibleIds)
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

  return (
    <div className="split catalogue">
      <div className="split-main">
        <PageHeader eyebrow="INVENTORY" title="Products" description="Your catalogue, stock and pricing in one place." actions={<>
          {canEdit && <Button variant={emptyCatalogue ? undefined : 'primary'} onClick={() => setDialog('purchase')}>Record purchase</Button>}
          {canEdit && <Button variant={emptyCatalogue ? 'primary' : undefined} onClick={() => setDialog('new')}>Add product</Button>}
          {canEdit && <Button onClick={() => setDialog('import')}>Import</Button>}
          <Button disabled={chosen === 0 || chosen > BULK_LIMIT} onClick={() => setDialog('labels')}>Print labels{chosen ? ` (${chosen.toLocaleString('en-IN')})` : ''}</Button>
          {(canEdit || canExport) && <ActionMenu>
            {canExport && <>
              <Button onClick={() => void downloadExport(current?.shop_id ?? '', 'csv').catch(e => setExportError(describeError(e)))}>Export CSV</Button>
              <Button onClick={() => void downloadExport(current?.shop_id ?? '', 'xlsx').catch(e => setExportError(describeError(e)))}>Export Excel</Button>
            </>}
            {canEdit && <Button onClick={() => setDialog('lists')}>Categories &amp; units</Button>}
          </ActionMenu>}
        </>} />
        {exportError && <Alert>{exportError}</Alert>}

        <div className="catalogue-heading"><h2>All products {data && <span className="count-badge">{total}</span>}</h2><span className="muted">{chosen ? `${chosen.toLocaleString('en-IN')} selected` : canEdit ? 'Select products to print labels or change them together' : 'Select products to print labels'}</span></div>
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
          {canEdit && <label className="check inline">
            <input type="checkbox" checked={query.noCode} onChange={(e) => update({ nocode: e.target.checked ? '1' : null })} />
            No barcode or code
          </label>}
          {filtered && <button className="link" onClick={() => { setSearch(''); update({ q: null, cat: null, low: null, exp: null, nocode: null }) }}>Clear filters</button>}
        </Toolbar>
        {canEdit && data && data.items.length > 0 && <p className="muted inline-hint">Use the pencil on a row to change its name, category, price or reorder level. Open a product for everything else. Stock changes from its details, so the history stays complete.</p>}
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
        {lostCount > 0 && <Alert kind="info">Your selection of {lostCount.toLocaleString('en-IN')} product{lostCount === 1 ? '' : 's'} was cleared because the search or filters changed. <button className="link" onClick={() => setSelection(NONE)}>Dismiss</button></Alert>}
        {chosen > 0 && <div className="bulk-bar" role="region" aria-label="Selected products">
          <p className="bulk-count" role="status">
            {sel.kind === 'matching'
              ? <>All <strong>{chosen.toLocaleString('en-IN')}</strong> products matching your search and filters are selected.</>
              : state === 'all' && total > chosen && data
                ? <>{chosen === visibleIds.length
                    ? <>All {visibleIds.length} product{visibleIds.length === 1 ? '' : 's'} on this page {visibleIds.length === 1 ? 'is' : 'are'} selected.</>
                    : <><strong>{chosen.toLocaleString('en-IN')}</strong> selected, including all {visibleIds.length} on this page.</>} <button className="link" onClick={() => setSelection(selectAllMatching(filters, total))}>Select all {total.toLocaleString('en-IN')} matching products</button></>
                : <><strong>{chosen.toLocaleString('en-IN')}</strong> selected</>}
          </p>
          <div className="bulk-actions">
            <Button onClick={() => setDialog('labels')} disabled={chosen > BULK_LIMIT}>Print labels</Button>
            {canEdit && <>
              <Button onClick={() => setBulk('category')} disabled={chosen > BULK_LIMIT}>Change category</Button>
              <Button onClick={() => setBulk('reorder')} disabled={chosen > BULK_LIMIT}>Set reorder level</Button>
              <Button onClick={() => setBulk('price')} disabled={chosen > BULK_LIMIT}>Change prices</Button>
              <Button onClick={() => setBulk('codes')} disabled={chosen > BULK_LIMIT}>Assign codes</Button>
              <Button variant="danger" onClick={() => setBulk('archive')} disabled={chosen > BULK_LIMIT}>Archive</Button>
            </>}
            <button className="link" onClick={() => setSelection(NONE)}>Clear selection</button>
          </div>
          {chosen > BULK_LIMIT && <p className="muted bulk-limit">Labels and bulk changes take up to {BULK_LIMIT.toLocaleString('en-IN')} products at a time. Narrow the search or filters.</p>}
        </div>}
        {data && data.items.length > 0 && (
          <>
            <div className="table-wrap">
              <table className="table products" aria-busy={products.isFetching}>
                <thead>
                  <tr>
                    <th>
                      <TriCheckbox state={state} label="Select all products on this page" onChange={() => setSelection(sel.kind === 'matching' ? NONE : togglePage(sel, visibleIds, filters))} />
                    </th>
                    {head('name', 'Product')}
                    <th className="hide-sm">Category</th>
                    {head('price', 'Price')}
                    {seeCost && <th className="hide-sm">Cost</th>}
                    {head('quantity', 'Stock')}
                    <th className="hide-sm">Reorder at</th>
                    <th className="hide-sm">Expiry</th>
                    {canEdit && <th><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => (
                    <ProductRow key={p.uuid} p={p} selected={p.uuid === selectedId} picked={sel.kind === 'matching' || (sel.kind === 'picked' && sel.ids.includes(p.uuid))} pickLocked={sel.kind === 'matching'} canEdit={canEdit} seeCost={seeCost}
                      categories={categories.data ?? []} onPick={() => setSelection(toggleOne(sel, p.uuid, filters))} onOpen={() => open(p.uuid)} />
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

      {selectedId && <ProductDetailPanel key={selectedId} id={selectedId} canEdit={canEdit} justAdded={added === selectedId} onClose={() => open(null)} />}
      {dialog === 'purchase' && <PurchaseComposer onClose={() => setDialog(null)} />}
      {dialog === 'new' && <ProductForm onClose={() => setDialog(null)} onSaved={(id) => { setDialog(null); setAdded(id); open(id); toast('Product added') }} />}
      {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} />}
      {dialog === 'lists' && <ListsManager onClose={() => setDialog(null)} />}
      {dialog === 'labels' && <Labels scope={scopeOf(sel)} onClose={() => setDialog(null)} />}
      {bulk && <BulkDialog kind={bulk} scope={scopeOf(sel)} count={chosen} categories={categories.data ?? []} onClose={() => setBulk(null)} onApplied={() => { if (bulk === 'archive') setSelection(NONE) }} />}
    </div>
  )
}
