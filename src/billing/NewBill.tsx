import { saleQuantity, SALE_QUANTITY_ERROR } from './checkout/quantity'
import { PageHeader } from '../components/ui/workspace'
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ApiError, api } from '../api/client'
import { Alert } from '../components/ui/ui'
import { describeError } from '../components/useAction'
import { useAuth } from '../auth/context'
import { InvoiceDraftError, openInvoiceDraft } from './checkout/invoiceDraftStore'
import { barcodeForCreation } from './checkout/barcode'
import { paymentMinorUnits, validPartialPayment } from './checkout/settlement'
import { formatMoney, formatQty, isAmount } from '../lib/money'
import { useDebounced } from '../lib/useDebounced'
import { SALES } from '../lib/vocabulary'
import { gstinProblem, phoneProblem } from '../lib/validate'
import { ProductForm } from '../products/components/ProductForm'
import type { Product, ProductDetail } from '../products/queries'
import { useShop } from '../shops/context'
import { can } from '../permissions'
import { CustomItemEditor, type CustomLine } from './CustomItem'
import { addOrIncrement, MAX_LINES, outOfStock, stockProblem, stockText, type CartItem, type DiscountMode, type RoundOffMode, type TaxMode } from './checkout/cart'
import { Completion } from './checkout/Completion'
import { CustomerPanel } from './checkout/CustomerPanel'
import { BLANK_CUSTOMER, type BillType, type CustomerFields } from './checkout/customerFields'
import { PAY_FULL_ID, PaymentPanel, type PaymentFields } from './checkout/PaymentPanel'
import { ScanBox } from './checkout/ScanBox'
import { READY, type Status } from './checkout/scanStatus'
import { createBill, useBillingMutation, useBillingQuery, type BillDetail, type BillInput, type CartInput, type InvoiceSettings, type Preview } from './queries'

type BillingControlSettings = InvoiceSettings & {
  default_tax_mode?: TaxMode
  round_off_mode?: RoundOffMode
  round_off_increment?: string
}

type ExtendedCartLine = CartInput['items'][number] & {
  discount_mode?: DiscountMode
  discount_value?: string
  tax_mode?: TaxMode | null
}

type ExtendedCartInput = Omit<CartInput, 'items'> & {
  items: ExtendedCartLine[]
  discount_mode?: DiscountMode
  discount_value?: string
  tax_mode?: TaxMode
  round_off_mode?: RoundOffMode
  round_off_increment?: string
  bill_date?: string | null
}

type ExtendedBillInput = Omit<BillInput, 'items'> & {
  items: ExtendedCartLine[]
  discount_mode?: DiscountMode
  discount_value?: string
  tax_mode?: TaxMode
  round_off_mode?: RoundOffMode
  round_off_increment?: string
  bill_date?: string | null
  notes?: string | null
}

function localToday(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const ROUND_OFF_INCREMENTS = [
  { value: '0.50', label: '₹0.50' },
  { value: '1.00', label: '₹1' },
  { value: '5.00', label: '₹5' },
  { value: '10.00', label: '₹10' },
] as const

const normalizeIncrement = (raw: string | number | null | undefined): string => {
  if (raw === null || raw === undefined || raw === '') return '1.00'
  const n = Number(raw)
  if (n === 0.5) return '0.50'
  if (n === 5) return '5.00'
  if (n === 10) return '10.00'
  return '1.00'
}

const lineDiscountOk = (mode: DiscountMode | undefined, value: string | undefined): boolean => {
  if (value === undefined || value.trim() === '') return true
  if (!isAmount(value)) return false
  return (mode ?? 'percent') === 'percent' ? Number(value) <= 100 : true
}

const lineControlSummary = (mode: DiscountMode | undefined, value: string | undefined, taxMode: TaxMode | null | undefined): string => {
  const parts: string[] = []
  const trimmed = (value ?? '').trim()
  if (trimmed && isAmount(trimmed) && Number(trimmed) > 0) {
    parts.push((mode ?? 'percent') === 'percent' ? `Disc ${formatQty(trimmed)}%` : `Disc ${formatMoney(trimmed)}`)
  }
  if (taxMode === 'inclusive') parts.push('Tax incl.')
  else if (taxMode === 'exclusive') parts.push('Tax excl.')
  return parts.join(' · ')
}

export function NewBill() {
  const { current } = useShop()
  const userId = useAuth().user?.id ?? ''
  const [round, setRound] = useState(0)
  // A shop switch, or "New invoice" on the completion screen, starts from a clean cart.
  return <BillForm key={`${userId}/${current?.shop_id}/${round}`} another={() => setRound(round + 1)} />
}

/** What survives a reload. `attempt` is an invoice whose save may or may not have reached the
 * server: its exact body and retry key are kept so a retry replays the same operation. */
interface BillDraft {
  items: CartItem[]
  custom: CustomLine[]
  customer: CustomerFields
  billType: BillType
  billDate?: string
  notes?: string
  discount: string
  discountMode?: DiscountMode
  taxMode?: TaxMode | null
  roundOffMode?: RoundOffMode | null
  roundOffIncrement?: string | null
  paid: PaymentFields['paid']
  amount: string
  method: PaymentFields['method']
  reference: string
  cash?: string
  reviewedContext?: string | null
  allowUnassigned?: boolean
  consentContext?: string | null
  pendingCatalogProduct?: Product | null
  attempt: { body: BillInput; key: string } | null
}

/** Fail closed for malformed recovery data instead of dropping a possibly sent invoice. */
function isBillDraft(value: unknown): value is BillDraft {
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  const strings = (v: Record<string, unknown>, keys: string[]) => keys.every(key => typeof v[key] === 'string')
  const validLineControls = (v: Record<string, unknown>) =>
    (v.discount_mode === undefined || v.discount_mode === 'percent' || v.discount_mode === 'amount') &&
    (v.discount_value === undefined || typeof v.discount_value === 'string') &&
    (v.tax_mode === undefined || v.tax_mode === null || v.tax_mode === 'inclusive' || v.tax_mode === 'exclusive')
  if (!record(value) || !Array.isArray(value.items) || value.items.length > MAX_LINES || !Array.isArray(value.custom) || value.custom.length > MAX_LINES) return false
  if (!value.items.every(item => record(item) && typeof item.quantity === 'string' && validLineControls(item) && record(item.product) && strings(item.product, ['uuid', 'name', 'selling_price', 'quantity']))) return false
  if (!value.custom.every(item => record(item) && strings(item, ['key', 'name', 'unit_price', 'gst_percent', 'quantity', 'cost', 'hsn_code', 'unit']) && validLineControls(item))) return false
  if (!record(value.customer) || !strings(value.customer, Object.keys(BLANK_CUSTOMER)) || !strings(value, ['discount', 'amount', 'method', 'reference'])) return false
  if (value.discountMode !== undefined && value.discountMode !== 'percent' && value.discountMode !== 'amount') return false
  if (value.billDate !== undefined && typeof value.billDate !== 'string') return false
  if (value.notes !== undefined && typeof value.notes !== 'string') return false
  if (value.taxMode !== undefined && value.taxMode !== null && value.taxMode !== 'inclusive' && value.taxMode !== 'exclusive') return false
  if (value.roundOffMode !== undefined && value.roundOffMode !== null && !['none', 'nearest', 'up', 'down'].includes(String(value.roundOffMode))) return false
  if (value.roundOffIncrement !== undefined && value.roundOffIncrement !== null && typeof value.roundOffIncrement !== 'string') return false
  if (!['b2c', 'b2b'].includes(String(value.billType)) || ![null, 'full', 'part', 'none'].includes(value.paid as null | string)) return false
  if (!['cash', 'upi', 'card', 'bank', 'online'].includes(String(value.method))) return false
  if ((value.cash !== undefined && typeof value.cash !== 'string') || (value.allowUnassigned !== undefined && typeof value.allowUnassigned !== 'boolean')) return false
  if (['reviewedContext', 'consentContext'].some(key => value[key] !== undefined && value[key] !== null && typeof value[key] !== 'string')) return false
  if (value.pendingCatalogProduct !== undefined && value.pendingCatalogProduct !== null && (!record(value.pendingCatalogProduct) || !strings(value.pendingCatalogProduct, ['uuid', 'name', 'selling_price', 'quantity']))) return false
  if (value.attempt === null) return true
  return record(value.attempt) && typeof value.attempt.key === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value.attempt.key) &&
    record(value.attempt.body) && Array.isArray(value.attempt.body.items) && value.attempt.body.items.length > 0 && value.attempt.body.items.length <= MAX_LINES &&
    record(value.attempt.body.payment) && typeof value.attempt.body.payment.amount === 'string' && typeof value.attempt.body.payment.method === 'string'
}

function hasInvoiceDraft(draft: BillDraft): boolean {
  return !!(draft.items.length || draft.custom.length || Object.values(draft.customer).some(value => value !== '') || draft.billType !== 'b2c' || draft.billDate || draft.notes || draft.discount !== '0' || draft.discountMode === 'amount' || draft.taxMode != null || draft.roundOffMode != null || draft.roundOffIncrement != null || draft.paid || draft.amount || draft.method !== 'cash' || draft.reference || draft.cash || draft.pendingCatalogProduct || draft.attempt)
}

function BillForm({ another }: { another: () => void }) {
  const { current, role } = useShop()
  const shop = current!.shop_id
  const userId = useAuth().user?.id ?? ''
  const [draftStore] = useState(() => openInvoiceDraft<BillDraft>(userId, shop, isBillDraft))
  const [restored, setRestored] = useState(draftStore.initial)
  const [storageError, setStorageError] = useState(draftStore.initialError?.message ?? '')
  const [draftConflict, setDraftConflict] = useState(!!draftStore.initialError)
  function persistenceFailure(error: unknown) {
    setStorageError(error instanceof Error ? error.message : 'The invoice draft could not be saved.')
    if (error instanceof InvoiceDraftError && error.kind !== 'storage') setDraftConflict(true)
  }
  const saved = restored?.data
  const canCustom = can(role, 'billing.custom')
  const canCreateProduct = can(role, 'products.edit')
  const canBackdate = can(role, 'billing.cancel')
  const today = localToday()
  const checkoutOwner = useRef({ userId, shop, allowed: canCreateProduct, blocked: false, uncertain: false, conflict: false })
  const [custom, setCustom] = useState<CustomLine[]>(saved?.custom ?? [])
  const [addingCustom, setAddingCustom] = useState(false)
  const [creating, setCreating] = useState<string | null>(null)
  const [pendingCatalogProduct, setPendingCatalogProduct] = useState<Product | null>(saved?.pendingCatalogProduct ?? null)
  const [unknown, setUnknown] = useState<string | null>(null)
  const [scanStatus, setScanStatus] = useState<Status>(READY)
  const [items, setItems] = useState<CartItem[]>(saved?.items ?? [])
  // Scans can arrive faster than a render, so the latest cart is also kept here.
  const itemsNow = useRef(items)
  const commit = (next: CartItem[]) => { itemsNow.current = next; setItems(next) }
  const [customer, setCustomer] = useState(saved?.customer ?? BLANK_CUSTOMER)
  const [customerOpen, setCustomerOpen] = useState(false)
  const [billType, setBillType] = useState<BillType>(saved?.billType ?? 'b2c')
  const [billDate, setBillDate] = useState(saved?.billDate ?? '')
  const [notes, setNotes] = useState(saved?.notes ?? '')
  const [discount, setDiscount] = useState(saved?.discount ?? '0')
  const [discountMode, setDiscountMode] = useState<DiscountMode>(saved?.discountMode ?? 'percent')
  const [taxMode, setTaxMode] = useState<TaxMode | null>(saved?.taxMode ?? null)
  const [roundOffMode, setRoundOffMode] = useState<RoundOffMode | null>(saved?.roundOffMode ?? null)
  const [roundOffIncrement, setRoundOffIncrement] = useState<string | null>(saved?.roundOffIncrement ?? null)
  const [openLineKeys, setOpenLineKeys] = useState<Record<string, boolean>>({})
  const shopSettings = useBillingQuery<BillingControlSettings>('invoice-settings', 'invoice-settings').data
  const shopDefaultTaxMode: TaxMode = shopSettings?.default_tax_mode === 'exclusive' ? 'exclusive' : 'inclusive'
  const shopDefaultRoundOffMode: RoundOffMode =
    shopSettings?.round_off_mode === 'none' || shopSettings?.round_off_mode === 'nearest' || shopSettings?.round_off_mode === 'up' || shopSettings?.round_off_mode === 'down'
      ? shopSettings.round_off_mode
      : shopSettings?.round_off_total === false ? 'none' : 'nearest'
  const shopDefaultRoundOffIncrement = normalizeIncrement(shopSettings?.round_off_increment)
  const effectiveTaxMode: TaxMode = taxMode ?? shopDefaultTaxMode
  const effectiveRoundOffMode: RoundOffMode = roundOffMode ?? shopDefaultRoundOffMode
  const effectiveRoundOffIncrement = roundOffIncrement ?? shopDefaultRoundOffIncrement
  // No default: the cashier says how the customer paid, so an unpaid invoice is never an accident.
  const [payment, setPayment] = useState<PaymentFields>({ paid: saved?.paid ?? null, amount: saved?.amount ?? '', method: saved?.method ?? 'cash', reference: saved?.reference ?? '', cash: saved?.cash ?? '' })
  const [paidError, setPaidError] = useState('')
  const [allowUnassigned, setAllowUnassigned] = useState(saved?.allowUnassigned ?? false)
  const [consentContext, setConsentContext] = useState<string | null>(saved?.consentContext ?? null)
  const [reviewedContext, setReviewedContext] = useState<string | null>(saved?.reviewedContext ?? null)
  const currentConsentContext = JSON.stringify([customer, billType, payment, reviewedContext])
  const [attempt, setAttempt] = useState<{ body: BillInput; key: string } | null>(saved?.attempt ?? null)
  const [done, setDone] = useState<BillDetail | null>(null)
  const sending = useRef(false)
  const [preparing, setPreparing] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const draftText = JSON.stringify({ items, custom, customer, billType, billDate, notes, discount, discountMode, taxMode, roundOffMode, roundOffIncrement, paid: payment.paid, amount: payment.amount, method: payment.method, reference: payment.reference, cash: payment.cash, reviewedContext, allowUnassigned, consentContext, pendingCatalogProduct, attempt } satisfies BillDraft)
  useEffect(() => {
    if (done || !userId || creating || preparing) return
    const draft = JSON.parse(draftText) as BillDraft
    const empty = !hasInvoiceDraft(draft)
    // Storage is coordinated across tabs; the callback only reports an external failure.
    void (empty ? draftStore.clear({ isActive: () => mounted.current }) : draftStore.save(draft, { isActive: () => mounted.current })).catch(persistenceFailure)
  }, [draftText, userId, shop, done, draftStore, creating, preparing])
  async function discard() {
    try { await draftStore.clear({ isActive: () => mounted.current }) } catch (error) { persistenceFailure(error); return }
    commit([]); setCustom([]); setCustomer(BLANK_CUSTOMER); setBillType('b2c'); setBillDate(''); setNotes(''); setDiscount('0')
    setDiscountMode('percent'); setTaxMode(null); setRoundOffMode(null); setRoundOffIncrement(null); setOpenLineKeys({})
    setPayment({ paid: null, amount: '', method: 'cash', reference: '', cash: '' }); setPaidError('')
    setAllowUnassigned(false); setConsentContext(null); setReviewedContext(null)
    setStorageError('')
    setRestored(null); setPendingCatalogProduct(null)
  }
  const mutation = useBillingMutation(createBill)

  // Customer details are checked as they are typed: a half-typed GSTIN must not reach
  // the price check (it would refuse the whole cart) or the saved invoice.
  const [checkCustomer, setCheckCustomer] = useState(false)
  const gstin = customer.customer_gstin.trim()
  const customerErrors = {
    phone: phoneProblem(customer.customer_phone),
    gstin: billType === 'b2b' && !gstin ? "A business invoice needs the customer's GSTIN." : gstinProblem(gstin),
  }
  const shownErrors = {
    phone: checkCustomer || customer.customer_phone.replace(/\D/g, '').length >= 10 ? customerErrors.phone : null,
    gstin: checkCustomer || gstin.length >= 15 ? customerErrors.gstin : null,
  }
  const lines: ExtendedCartLine[] = [
    ...items.map(i => ({
      product_uuid: i.product.uuid,
      quantity: saleQuantity(i.quantity) ?? i.quantity,
      discount_mode: i.discount_mode ?? 'percent',
      discount_value: (i.discount_value ?? '').trim() || '0',
      tax_mode: i.tax_mode ?? null,
    })),
    ...custom.map(c => ({
      name: c.name,
      quantity: saleQuantity(c.quantity) ?? c.quantity,
      unit_price: c.unit_price,
      gst_percent: c.gst_percent,
      cost: c.cost || null,
      hsn_code: c.hsn_code || null,
      unit: c.unit || null,
      discount_mode: c.discount_mode ?? 'percent',
      discount_value: (c.discount_value ?? '').trim() || '0',
      tax_mode: c.tax_mode ?? null,
    })),
  ]
  const discountPercentField = discountMode === 'percent' ? discount : '0'
  const explicitBillDate = canBackdate && billDate.trim() ? billDate.trim() : undefined
  const billDateOk = !explicitBillDate || (explicitBillDate >= '2000-01-01' && explicitBillDate <= today)
  const cart: ExtendedCartInput = {
    ...customer,
    customer_phone: customerErrors.phone ? null : customer.customer_phone,
    customer_gstin: gstinProblem(gstin) ? null : gstin || null,
    place_of_supply_state_code: customer.place_of_supply_state_code || null,
    bill_type: billType,
    discount_percent: discountPercentField,
    discount_mode: discountMode,
    discount_value: discount,
    tax_mode: effectiveTaxMode,
    round_off_mode: effectiveRoundOffMode,
    round_off_increment: effectiveRoundOffIncrement,
    ...(explicitBillDate ? { bill_date: explicitBillDate } : {}),
    items: lines,
  }
  const lineCount = items.length + custom.length
  // Only what changes the price asks the server again; typing a name or phone does not.
  const pricedText = JSON.stringify({
    bill_type: billType,
    discount_percent: discountPercentField,
    discount_mode: discountMode,
    discount_value: discount,
    tax_mode: effectiveTaxMode,
    round_off_mode: effectiveRoundOffMode,
    round_off_increment: effectiveRoundOffIncrement,
    ...(explicitBillDate ? { bill_date: explicitBillDate } : {}),
    customer_gstin: cart.customer_gstin,
    place_of_supply_state_code: cart.place_of_supply_state_code,
    items: lines,
  })
  const settledText = useDebounced(pricedText, 300)
  const priceCurrent = settledText === pricedText
  // A business invoice cannot be priced until its GSTIN is complete; say so instead of showing a refusal.
  const needsGstin = billType === 'b2b' && !!customerErrors.gstin
  const quantitiesOk = [...items, ...custom].every(i => saleQuantity(i.quantity) !== null)
  const lineDiscountsOk = [...items, ...custom].every(i => lineDiscountOk(i.discount_mode, i.discount_value))
  const discountOk = discountMode === 'percent' ? isAmount(discount) && Number(discount) <= 100 : isAmount(discount)
  // The server prices catalogue lines first, then the other lines in the order added.
  const preview = useQuery({
    queryKey: ['bill-preview', shop, settledText],
    queryFn: () => api.post<Preview>(`/v1/shops/${shop}/bills/preview`, JSON.parse(settledText) as ExtendedCartInput),
    enabled: lineCount > 0 && quantitiesOk && lineDiscountsOk && discountOk && billDateOk && !needsGstin && !attempt, retry: false, placeholderData: keepPreviousData,
  })
  const pricing = lineCount > 0 && quantitiesOk && lineDiscountsOk && discountOk && billDateOk && !attempt && !needsGstin && !preview.error && (!priceCurrent || preview.isFetching)
  const totals = lineCount > 0 && quantitiesOk && lineDiscountsOk && discountOk && billDateOk && !needsGstin ? preview.data : undefined
  const locked = !!attempt || mutation.isPending || preparing || draftConflict || !!creating
  useLayoutEffect(() => {
    checkoutOwner.current = { userId, shop, allowed: canCreateProduct, blocked: locked, uncertain: !!attempt, conflict: draftConflict }
  }, [userId, shop, canCreateProduct, locked, attempt, draftConflict])
  const observedReview = useRef(saved?.reviewedContext ?? null)
  const reviewCurrent = !!totals && reviewedContext === (totals.reviewed_context ?? null)
  const consentCurrent = allowUnassigned && consentContext === currentConsentContext && reviewCurrent
  useEffect(() => {
    if (attempt || !totals || !priceCurrent || preview.isFetching || preview.error) return
    const context = totals.reviewed_context ?? null
    if ((observedReview.current !== null && observedReview.current !== context) || (saved?.paid && !saved.reviewedContext && observedReview.current === null)) {
      setPayment(value => ({ ...value, paid: null }))
      setAllowUnassigned(false)
      setPaidError('Review the updated invoice amounts and choose how the customer paid again. Your entered payment details are kept.')
    }
    if (observedReview.current === null && !saved?.reviewedContext) setReviewedContext(context)
    observedReview.current = context
  }, [totals, priceCurrent, preview.isFetching, preview.error, attempt, saved])
  // A cart the server refused (not enough stock, a whole-unit item): retrying cannot help.
  const cartProblem = !needsGstin && preview.error instanceof ApiError && preview.error.status === 422
  const customPreview = totals?.lines?.filter(l => l.product_uuid === null) ?? []

  const note = (text: string, kind: Status['kind'] = 'ok'): Status => ({ kind, text })
  function addProduct(product: Product): Status {
    const owner = checkoutOwner.current
    if (!mounted.current || owner.userId !== userId || owner.shop !== shop || owner.uncertain || owner.conflict || owner.blocked) return note('This invoice is no longer available for adding products.', 'error')
    setUnknown(null)
    const current = itemsNow.current
    const existing = current.some(i => i.product.uuid === product.uuid)
    if (!existing && current.length + custom.length >= MAX_LINES) return note(`An invoice can have ${MAX_LINES} lines. Create this invoice first.`, 'error')
    if (outOfStock(product)) return note(`${product.name} is out of stock, so it cannot be sold. Receive stock first.`, 'error')
    const next = addOrIncrement(current, product)
    if (saleQuantity(next.quantity) === null) return note(`${product.name}: ${SALE_QUANTITY_ERROR}`, 'error')
    commit(next.items)
    const warning = stockProblem(product, next.quantity)
    if (warning) return note(`${product.name} × ${formatQty(next.quantity)}. ${warning}`, 'warn')
    return note(next.added ? `Added ${product.name}` : `${product.name} × ${formatQty(next.quantity)}`)
  }
  const setQuantity = (index: number, quantity: string) => commit(items.map((row, n) => n === index ? { ...row, quantity } : row))
  const updateItem = (index: number, patch: Partial<Pick<CartItem, 'discount_mode' | 'discount_value' | 'tax_mode'>>) =>
    commit(items.map((row, n) => n === index ? { ...row, ...patch } : row))
  const updateCustom = (index: number, patch: Partial<Pick<CustomLine, 'discount_mode' | 'discount_value' | 'tax_mode'>>) =>
    setCustom(custom.map((row, n) => n === index ? { ...row, ...patch } : row))
  const toggleLineOptions = (key: string) => setOpenLineKeys(prev => ({ ...prev, [key]: !prev[key] }))
  // The payment options may only just have appeared (the first item), so look after this render.
  const goToPayment = () => { setTimeout(() => document.getElementById(PAY_FULL_ID)?.focus(), 0) }
  const unlinked = !!payment.paid && payment.paid !== 'full' && (paymentMinorUnits(totals?.total ?? '') ?? 0n) > 0n && !/\d/.test(customer.customer_phone)
  const canCreate = quantitiesOk && lineDiscountsOk && discountOk && billDateOk && !pendingCatalogProduct && !!totals && priceCurrent && !preview.isFetching && !preview.error &&
    lineCount > 0 && (!payment.paid || reviewCurrent) && (!unlinked || consentCurrent)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (sending.current || draftConflict || (!attempt && !canCreate)) return
    let paidNow = '0'
    if (!attempt && (customerErrors.phone || customerErrors.gstin)) {
      setCheckCustomer(true)
      setCustomerOpen(true)
      // The panel opens on this render; focus once it is shown.
      setTimeout(() => document.querySelector<HTMLInputElement>(`input[name="${customerErrors.phone ? 'customer_phone' : 'customer_gstin'}"]`)?.focus())
      return
    }
    if (!attempt) {
      const total = totals!.total
      if (!payment.paid) { setPaidError('Choose how the customer paid: in full, part or not yet.'); goToPayment(); return }
      if (payment.paid === 'part' && (!validPartialPayment(payment.amount, total))) return setPaidError(`Enter the amount paid now: more than ₹0 and less than ${formatMoney(total)}, with at most two decimal places.`)
      if (typeof totals!.reviewed_context !== 'string' || !/^br1:[a-f0-9]{64}$/.test(totals!.reviewed_context)) return setPaidError('This server cannot confirm the reviewed invoice. Your payment details are kept. Update or reconnect to a compatible Storely server and review the invoice before saving.')
      paidNow = payment.paid === 'full' ? total : payment.paid === 'part' ? payment.amount : '0'
    }
    setPaidError('')
    sending.current = true
    setPreparing(true)
    const reference = payment.method === 'cash' ? null : payment.reference.trim() || null
    const next = attempt ?? {
      body: {
        ...cart,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        settlement_choice: payment.paid === 'part' ? 'partial' : payment.paid === 'none' ? 'unpaid' : 'full',
        reviewed_context: totals!.reviewed_context,
        allow_unassigned_credit: unlinked && consentCurrent,
        payment: { amount: paidNow, method: payment.paid === 'none' ? 'cash' : payment.method, reference: payment.paid === 'none' ? null : reference },
      } as ExtendedBillInput as BillInput,
      key: crypto.randomUUID(),
    }
    // React effects run later: durably freeze the exact key/body before sending.
    try {
      await draftStore.save({ ...JSON.parse(draftText) as BillDraft, attempt: next }, { isActive: () => mounted.current })
      setStorageError('')
    } catch (error) { persistenceFailure(error); sending.current = false; if (mounted.current) setPreparing(false); return }
    // A queued lock may outlive this page or its user/shop. Keep the frozen
    // request for recovery, but do not send from a screen that was left.
    if (!mounted.current) { sending.current = false; return }
    setAttempt(next)
    try {
      const result = await mutation.mutateAsync(next)
      try { await draftStore.clear({ completed: true }); setStorageError('') } catch (error) { persistenceFailure(error) }
      setDone(result)
    } catch (error) {
      // Only a first fresh validation rejection proves this invoice did not commit.
      // On a restored/uncertain retry, validation may have changed since the
      // original request: keep its exact key/body frozen until success.
      if (!attempt && error instanceof ApiError && (error.status === 422 || (error.status === 409 && ['overpayment', 'no_free_number', 'checkout_changed'].includes(error.code)))) {
        try {
          const checkoutChanged = error.code === 'checkout_changed'
          await draftStore.save({ ...JSON.parse(draftText) as BillDraft, ...(checkoutChanged ? { paid: null } : {}), attempt: null }, { releaseAttempt: true, isActive: () => mounted.current })
          setAttempt(null)
          if (checkoutChanged) {
            setPayment(value => ({ ...value, paid: null }))
            setAllowUnassigned(false)
            setPaidError('Review the updated invoice amounts and choose how the customer paid again. Your entered payment details are kept.')
            void preview.refetch()
          }
        } catch (storageFailure) { persistenceFailure(storageFailure) }
      }
      if (error instanceof ApiError && error.code === 'unassigned_credit') void preview.refetch()
    }
    finally { sending.current = false; if (mounted.current) setPreparing(false) }
  }

  if (done) return <div className="checkout-page"><PageHeader eyebrow="SALES / INVOICES" title={SALES.newInvoice} actions={<Link className="button secondary" to="/billing">{SALES.invoices}</Link>} />{storageError && <Alert>{storageError}</Alert>}<Completion detail={done} onAnother={async () => {
    try { await draftStore.clear({ completed: true }); another() } catch (error) { persistenceFailure(error) }
  }} /></div>

  const activeDraft = JSON.parse(draftText) as BillDraft
  const hasDraft = hasInvoiceDraft(activeDraft)
  async function moveDraft(action: 'hold' | 'resume' | 'discardHeld', id?: string) {
    if (sending.current || locked) return
    sending.current = true; setPreparing(true)
    try {
      const options = { isActive: () => mounted.current }
      if (action === 'hold') await draftStore.hold(activeDraft, options)
      else if (action === 'resume') await draftStore.resume(id!, hasDraft ? activeDraft : null, options)
      else await draftStore.discardHeld(id!, hasDraft ? activeDraft : null, options)
      if (mounted.current) another()
    } catch (error) { persistenceFailure(error) }
    finally { sending.current = false; if (mounted.current) setPreparing(false) }
  }
  async function openProduct(code: string) {
    const barcode = barcodeForCreation(code)
    if (!barcode || locked || sending.current || !canCreateProduct || pendingCatalogProduct) return
    const ownsCheckout = () => mounted.current && checkoutOwner.current.userId === userId && checkoutOwner.current.shop === shop && checkoutOwner.current.allowed && !checkoutOwner.current.uncertain && !checkoutOwner.current.conflict
    sending.current = true; setPreparing(true)
    try {
      await draftStore.save(activeDraft, { isActive: ownsCheckout })
      if (ownsCheckout()) setCreating(barcode)
    } catch (error) { persistenceFailure(error) }
    finally { sending.current = false; if (mounted.current) setPreparing(false) }
  }
  async function receiveCatalogProduct(product: Product, refresh = false) {
    const ownsCheckout = () => mounted.current && checkoutOwner.current.userId === userId && checkoutOwner.current.shop === shop && checkoutOwner.current.allowed && !checkoutOwner.current.uncertain && !checkoutOwner.current.conflict
    if (sending.current || !ownsCheckout()) return
    // A product is already committed in the catalogue. Retry only its cart handoff.
    if (!refresh && outOfStock(product)) {
      setScanStatus(note(`${product.name} is out of stock, so it cannot be sold. Receive stock first.`, 'error'))
      setUnknown(null); setCreating(null)
      return
    }
    sending.current = true; setPreparing(true); setPendingCatalogProduct(product)
    try {
      if (refresh) {
        const id = product.uuid
        product = (await api.get<ProductDetail>(`/v1/shops/${shop}/products/${encodeURIComponent(id)}`)).product
        if (product.uuid !== id) throw new Error('The catalogue returned a different product. Keep this saved product and retry after refreshing the catalogue.')
        if (!ownsCheckout()) return
        setPendingCatalogProduct(product)
      }
      // Keep exact identity recoverable even if the subsequent larger cart write fails.
      await draftStore.save({ ...activeDraft, pendingCatalogProduct: product }, { isActive: ownsCheckout })
      if (outOfStock(product)) throw new Error(`${product.name} is out of stock, so it cannot be sold. Receive stock first.`)
      if (!activeDraft.items.some(line => line.product.uuid === product.uuid) && activeDraft.items.length + activeDraft.custom.length >= MAX_LINES) {
        setStorageError(`The product is saved in the catalogue. This invoice already has ${MAX_LINES} lines. Remove a line, then retry adding the saved product.`)
        return
      }
      const next = addOrIncrement(activeDraft.items, product)
      if (saleQuantity(next.quantity) === null) throw new Error(`${product.name}: ${SALE_QUANTITY_ERROR}`)
      await draftStore.save({ ...activeDraft, items: next.items, pendingCatalogProduct: null }, { isActive: ownsCheckout })
      if (!ownsCheckout()) return
      commit(next.items); setPendingCatalogProduct(null); setUnknown(null); setStorageError('')
      const warning = stockProblem(product, next.quantity)
      setScanStatus(note(warning ? `${product.name} × ${formatQty(next.quantity)}. ${warning}` : next.added ? `Added ${product.name}` : `${product.name} × ${formatQty(next.quantity)}`, warning ? 'warn' : 'ok'))
    } catch (error) {
      if (mounted.current) {
        persistenceFailure(error)
        setStorageError(`The product was saved in the catalogue, but it has not been added to this invoice. ${error instanceof Error ? error.message : 'Restore browser storage and retry adding the saved product.'}`)
      }
    } finally {
      sending.current = false
      if (mounted.current) { setCreating(null); setPreparing(false) }
    }
  }
  async function leaveCatalogProduct() {
    if (sending.current || locked) return
    sending.current = true; setPreparing(true)
    try {
      await draftStore.save({ ...activeDraft, pendingCatalogProduct: null }, { isActive: () => mounted.current })
      if (mounted.current) { setPendingCatalogProduct(null); setUnknown(null); setStorageError(''); setScanStatus(note('The saved product remains in the catalogue.')) }
    } catch (error) { persistenceFailure(error) }
    finally { sending.current = false; if (mounted.current) setPreparing(false) }
  }
  const canSave = !creating && !draftConflict && !preparing && !mutation.isPending && (!!attempt || canCreate)
  const rows: [string, string][] = totals ? ([['Subtotal', totals.subtotal], ['Discount', totals.discount_amount], ['CGST', totals.cgst_amount], ['SGST', totals.sgst_amount], ['IGST', totals.igst_amount], ['Round-off', totals.round_off_amount]] as [string, string][]).filter(([k, v]) => k === 'Subtotal' || Number(v) !== 0) : []
  return <div className="checkout-page">
    <PageHeader eyebrow="SALES / INVOICES" title={SALES.newInvoice} actions={<Link className="button secondary" to="/billing">← Back to {SALES.invoices.toLowerCase()}</Link>} />
    {storageError && <Alert>{storageError}</Alert>}
    {pendingCatalogProduct && <Alert kind="info">
      <p><strong>{pendingCatalogProduct.name}</strong> is saved in the catalogue. It has not been added to this invoice.</p>
      <button type="button" disabled={locked || !canCreateProduct} onClick={() => void receiveCatalogProduct(pendingCatalogProduct, true)}>Retry adding saved product</button>{' '}
      <button type="button" className="link" disabled={locked} onClick={() => void leaveCatalogProduct()}>Continue without adding product</button>
    </Alert>}
    {restored && <Alert kind="info">
      {attempt ? 'An invoice you were saving was not confirmed before this page closed. Retry saving to safely finish this same invoice; it will not be created twice.' : `Your unfinished invoice from ${new Date(restored.savedAt).toLocaleString()} was restored.`}
      {!attempt && !draftConflict && <> <button type="button" className="link" onClick={discard}>Discard draft</button></>}
    </Alert>}
    <form className="checkout-grid" onSubmit={submit}>
      <fieldset className="checkout-main" disabled={locked}>
        <div className="actions"><button type="button" className="secondary" disabled={locked || !hasDraft} onClick={() => void moveDraft('hold')}>Hold invoice</button></div>
        {!!draftStore.initialHeld.length && <section className="card" aria-label="Held invoices">
          <h2>Held invoices ({draftStore.initialHeld.length})</h2>
          <p className="muted">Saved in this browser for this account and shop. Resuming holds your current editable invoice in its place.</p>
          <ul>{draftStore.initialHeld.map(held => <li key={held.id}>
            <strong>{held.data.customer.customer_name.trim() || 'Walk-in customer'}</strong> · {held.data.items.length + held.data.custom.length} items · {new Date(held.savedAt).toLocaleString()}
            <div className="actions"><button type="button" disabled={locked} onClick={() => void moveDraft('resume', held.id)}>Resume held invoice</button><button type="button" className="link" disabled={locked} onClick={() => void moveDraft('discardHeld', held.id)}>Discard held invoice</button></div>
          </li>)}</ul>
        </section>}
        <section className="card checkout-items" aria-label="Items">
          <ScanBox status={scanStatus} onStatus={setScanStatus} disabled={locked} onProduct={product => addProduct(product)} onUnknown={setUnknown} onDone={goToPayment} />
          {unknown && <div className="unknown-code" role="alert">
            <p>No product has the barcode or code <code>{unknown}</code>.</p>
            <div className="actions">
              {canCreateProduct && !pendingCatalogProduct && barcodeForCreation(unknown) && <button type="button" onClick={() => void openProduct(unknown)}>Create product with this barcode</button>}
              {canCustom && <button type="button" onClick={() => setAddingCustom(true)}>Add as item not in the list</button>}
              <button type="button" className="link" onClick={() => setUnknown(null)}>Dismiss</button>
            </div>
            {!canCreateProduct && !canCustom && <p className="muted">Ask the owner to add this product to the list.</p>}
          </div>}
          <div className="cart-head"><h2>Items{lineCount ? ` (${lineCount})` : ''}</h2>{canCustom && <button type="button" className="link" disabled={locked || lineCount >= MAX_LINES} onClick={() => setAddingCustom(true)}>+ Item not in the list</button>}</div>
          {!lineCount && <div className="cart-empty"><strong>Scan or search to start this invoice</strong><p>The first product you add appears here.</p></div>}
          {lineCount > 0 && <div className="table-wrap cart-table"><table className="table"><thead><tr><th>Item</th><th>Quantity</th><th className="num hide-sm">Price</th><th className="num">Amount</th><th><span className="sr-only">Remove</span></th></tr></thead><tbody>
            {items.map((i, index) => {
              const line = totals?.lines?.find(l => l.product_uuid === i.product.uuid)
              const problem = stockProblem(i.product, i.quantity)
              const rowKey = `item:${i.product.uuid}`
              const open = !!openLineKeys[rowKey]
              const summary = lineControlSummary(i.discount_mode, i.discount_value, i.tax_mode)
              const discValid = lineDiscountOk(i.discount_mode, i.discount_value)
              return <tr key={i.product.uuid}>
                <td className="cart-item">
                  <span className="cart-name">{i.product.name}</span>
                  <small className="muted">{[i.product.barcode || i.product.product_code, i.product.gst_percent != null ? `GST ${formatQty(i.product.gst_percent)}%` : ''].filter(Boolean).join(' · ')}</small>
                  {problem ? <small className="field-error" role="alert">{problem}</small> : stockText(i.product) && <small className="muted">{stockText(i.product)}</small>}
                  <div className="line-meta">
                    {summary && <small className="muted">{summary} · </small>}
                    <button type="button" className="link" aria-expanded={open} aria-label={`Line options for ${i.product.name}`} onClick={() => toggleLineOptions(rowKey)}>{open ? 'Hide options' : 'Discount / tax'}</button>
                  </div>
                  {open && <div className="line-controls">
                    <select aria-label={`Discount type for ${i.product.name}`} value={i.discount_mode ?? 'percent'} onChange={e => updateItem(index, { discount_mode: e.target.value as DiscountMode })}>
                      <option value="percent">%</option>
                      <option value="amount">₹</option>
                    </select>
                    <input className="qty" aria-label={`Discount for ${i.product.name}`} type="text" inputMode="decimal" placeholder="0" aria-invalid={!discValid || undefined} value={i.discount_value ?? ''} onChange={e => updateItem(index, { discount_value: e.target.value })} />
                    <select aria-label={`Tax mode for ${i.product.name}`} value={i.tax_mode ?? ''} onChange={e => updateItem(index, { tax_mode: (e.target.value || null) as TaxMode | null })}>
                      <option value="">Bill default</option>
                      <option value="inclusive">Incl.</option>
                      <option value="exclusive">Excl.</option>
                    </select>
                    {!discValid && <small className="field-error" role="alert">{(i.discount_mode ?? 'percent') === 'percent' ? 'Discount must be 0–100%.' : 'Enter a valid amount.'}</small>}
                  </div>}
                </td>
                <td><input className="qty" aria-label={`Quantity for ${i.product.name}`} type="text" inputMode="decimal" aria-invalid={saleQuantity(i.quantity) === null} aria-describedby={saleQuantity(i.quantity) === null ? `quantity-error-${index}` : undefined} required value={i.quantity} onChange={e => setQuantity(index, e.target.value)} />{saleQuantity(i.quantity) === null && <small id={`quantity-error-${index}`} className="field-error" role="alert">{SALE_QUANTITY_ERROR}</small>}{i.product.unit_name && <small className="muted unit"> {i.product.unit_name}</small>}</td>
                <td className="num hide-sm">{line ? formatMoney(line.unit_price) : '—'}</td>
                <td className="num">{line ? formatMoney(line.amount) : '—'}</td>
                <td><button type="button" className="link remove" aria-label={`Remove ${i.product.name}`} onClick={() => commit(items.filter((_, n) => n !== index))}>✕</button></td></tr>
            })}
            {custom.map((c, index) => {
              const line = customPreview[index]
              const rowKey = `custom:${c.key}`
              const open = !!openLineKeys[rowKey]
              const summary = lineControlSummary(c.discount_mode, c.discount_value, c.tax_mode)
              const discValid = lineDiscountOk(c.discount_mode, c.discount_value)
              return <tr key={c.key}>
                <td className="cart-item">
                  <span className="cart-name">{c.name}</span>
                  <small className="muted">Not in the list · GST {c.gst_percent}%</small>
                  <div className="line-meta">
                    {summary && <small className="muted">{summary} · </small>}
                    <button type="button" className="link" aria-expanded={open} aria-label={`Line options for ${c.name}`} onClick={() => toggleLineOptions(rowKey)}>{open ? 'Hide options' : 'Discount / tax'}</button>
                  </div>
                  {open && <div className="line-controls">
                    <select aria-label={`Discount type for ${c.name}`} value={c.discount_mode ?? 'percent'} onChange={e => updateCustom(index, { discount_mode: e.target.value as DiscountMode })}>
                      <option value="percent">%</option>
                      <option value="amount">₹</option>
                    </select>
                    <input className="qty" aria-label={`Discount for ${c.name}`} type="text" inputMode="decimal" placeholder="0" aria-invalid={!discValid || undefined} value={c.discount_value ?? ''} onChange={e => updateCustom(index, { discount_value: e.target.value })} />
                    <select aria-label={`Tax mode for ${c.name}`} value={c.tax_mode ?? ''} onChange={e => updateCustom(index, { tax_mode: (e.target.value || null) as TaxMode | null })}>
                      <option value="">Bill default</option>
                      <option value="inclusive">Incl.</option>
                      <option value="exclusive">Excl.</option>
                    </select>
                    {!discValid && <small className="field-error" role="alert">{(c.discount_mode ?? 'percent') === 'percent' ? 'Discount must be 0–100%.' : 'Enter a valid amount.'}</small>}
                  </div>}
                </td>
                <td><input className="qty" aria-label={`Quantity for ${c.name}`} type="text" inputMode="decimal" aria-invalid={saleQuantity(c.quantity) === null} aria-describedby={saleQuantity(c.quantity) === null ? `custom-quantity-error-${index}` : undefined} required value={c.quantity} onChange={e => setCustom(custom.map((row, n) => n === index ? { ...row, quantity: e.target.value } : row))} />{saleQuantity(c.quantity) === null && <small id={`custom-quantity-error-${index}`} className="field-error" role="alert">{SALE_QUANTITY_ERROR}</small>}</td>
                <td className="num hide-sm">{line ? formatMoney(line.unit_price) : formatMoney(c.unit_price)}</td>
                <td className="num">{line ? formatMoney(line.amount) : '—'}</td>
                <td><button type="button" className="link remove" aria-label={`Remove ${c.name}`} onClick={() => setCustom(custom.filter((_, n) => n !== index))}>✕</button></td></tr>
            })}
          </tbody></table></div>}
          {cartProblem && <Alert>{describeError(preview.error)} Change the quantity or remove the item.</Alert>}
        </section>
      </fieldset>
      <aside className="checkout-summary" aria-label="Customer and payment">
        <fieldset className="bare" disabled={locked}>
          <CustomerPanel customer={customer} onChange={next => { setCustomer(next); setAllowUnassigned(false) }} billType={billType} onBillType={next => { setBillType(next); setAllowUnassigned(false) }} errors={shownErrors} open={customerOpen || !!(shownErrors.phone || shownErrors.gstin)} onOpen={setCustomerOpen} disabled={locked} />
          <section className="card" aria-label="Invoice details">
            <label>
              Invoice date
              <input
                type="date"
                max={today}
                value={canBackdate ? (billDate || today) : today}
                disabled={locked || !canBackdate}
                aria-invalid={!billDateOk || undefined}
                onChange={e => setBillDate(e.target.value === today ? '' : e.target.value)}
              />
            </label>
            {!canBackdate && <small className="muted">Only owners and admins can backdate invoices.</small>}
            {!billDateOk && <small className="field-error" role="alert">Choose a date on or before today (from 2000-01-01).</small>}
            <label className="field-block">
              Invoice notes
              <textarea
                rows={2}
                maxLength={500}
                placeholder="Optional note printed on the invoice"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </label>
          </section>
        </fieldset>
        <section className="card checkout-totals" aria-label="Invoice total" aria-busy={pricing}>
          {!lineCount ? <p className="muted">Totals and payment appear once you add an item.</p> : <>
            {needsGstin && <Alert kind="info">A business invoice needs the customer's GSTIN before it can be priced. <button type="button" className="link" onClick={() => setCustomerOpen(true)}>Enter the GSTIN</button></Alert>}
            {preview.error && !cartProblem && !needsGstin && <Alert>{describeError(preview.error)} <button type="button" className="link" onClick={() => void preview.refetch()}>Retry pricing</button></Alert>}
            <dl className={`bill-totals${pricing ? ' pending' : ''}`}>
              {rows.map(([k, v]) => <div className="row" key={k}><dt>{k}</dt><dd>{formatMoney(v)}</dd></div>)}
              <div className="row grand-total"><dt>Total</dt><dd>{totals ? formatMoney(totals.total) : '—'}</dd></div>
            </dl>
            <p className="pricing-note muted" role="status">{pricing ? 'Updating total…' : ''}</p>
            <div className="billing-controls">
              <div className="discount-row">
                <label className="discount">Discount ({discountMode === 'percent' ? '%' : '₹'})<input type="number" inputMode="decimal" min="0" max={discountMode === 'percent' ? '100' : undefined} step="0.01" required value={discount} disabled={locked} aria-invalid={!discountOk || undefined} onChange={e => setDiscount(e.target.value)} /></label>
                <select aria-label="Discount mode" value={discountMode} disabled={locked} onChange={e => setDiscountMode(e.target.value as DiscountMode)}>
                  <option value="percent">%</option>
                  <option value="amount">₹</option>
                </select>
              </div>
              {!discountOk && <small className="field-error" role="alert">{discountMode === 'percent' ? 'Enter a discount between 0% and 100%.' : 'Enter a valid discount amount (0 or more).'}</small>}
              <label>Tax mode<select value={effectiveTaxMode} disabled={locked} onChange={e => setTaxMode(e.target.value as TaxMode)}>
                <option value="inclusive">Tax inclusive</option>
                <option value="exclusive">Tax exclusive</option>
              </select></label>
              <label>Round-off<select value={effectiveRoundOffMode} disabled={locked} onChange={e => setRoundOffMode(e.target.value as RoundOffMode)}>
                <option value="none">None</option>
                <option value="nearest">Nearest</option>
                <option value="up">Up</option>
                <option value="down">Down</option>
              </select></label>
              {effectiveRoundOffMode !== 'none' && <label>Round-off increment<select value={effectiveRoundOffIncrement} disabled={locked} onChange={e => setRoundOffIncrement(e.target.value)}>
                {ROUND_OFF_INCREMENTS.map(inc => <option key={inc.value} value={inc.value}>{inc.label}</option>)}
              </select></label>}
            </div>
            {items.some(i => { const line = totals?.lines?.find(l => l.product_uuid === i.product.uuid); return line && i.product.mrp_price != null && Number(line.unit_price) > Number(i.product.mrp_price) }) && <Alert kind="info">A product’s selling price is above its MRP. Check the price before creating the invoice.</Alert>}
            <PaymentPanel total={totals?.total} value={payment} onChange={next => { setAllowUnassigned(false); setReviewedContext(totals?.reviewed_context ?? null); setPayment(next); setPaidError('') }} error={paidError} disabled={locked} />
            {unlinked && !locked && <Alert kind="info">
              <p>Add a customer with a phone number to put this balance on their account. Unassigned balances can be collected from the invoice.</p>
              <button type="button" className="link" onClick={() => setCustomerOpen(true)}>Add a customer with a phone number</button>
              <label className="check"><input type="checkbox" disabled={pricing || !reviewCurrent} checked={consentCurrent} onChange={e => { setAllowUnassigned(e.target.checked); setConsentContext(currentConsentContext) }} />Keep this balance unassigned</label>
            </Alert>}
          </>}
        </section>
        {mutation.error && <Alert>{describeError(mutation.error)} {attempt ? 'Your cart is locked. Retry to safely retrieve or create this same invoice.' : 'Check your cart and try again.'}</Alert>}
        <div className="actions checkout-submit"><button className="primary" disabled={!canSave}>{mutation.isPending || preparing ? 'Saving…' : attempt ? 'Retry saving invoice' : SALES.createInvoice}{!mutation.isPending && !preparing && !attempt && totals && !pricing ? ` · ${formatMoney(totals.total)}` : ''}</button></div>
      </aside>
    </form>
    {addingCustom && <CustomItemEditor onClose={() => setAddingCustom(false)} onAdd={line => { setCustom([...custom, line]); setAddingCustom(false); setUnknown(null) }} />}
    {creating && <ProductForm startingBarcode={creating} onClose={() => setCreating(null)} onSaved={(_id, savedProduct) => receiveCatalogProduct(savedProduct)} />}
  </div>
}
