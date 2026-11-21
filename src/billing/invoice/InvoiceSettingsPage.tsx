import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { api, ApiError } from '../../api/client'
import type { components } from '../../api/schema'
import { Alert, Field, Loading } from '../../components/ui/ui'
import { useAction } from '../../components/useAction'
import { useFirstError } from '../../components/useFirstError'
import { emailProblem, gstinProblem, shopPhoneProblem, upiProblem } from '../../lib/validate'
import { imageSrc, prepareImage } from '../../lib/images'
import { Button, PageHeader } from '../../components/ui/workspace'
import { useAuth } from '../../auth/context'
import { useShop } from '../../shops/context'
import { InvoiceDocument, type Paper } from './InvoiceDocument'
import { PAPERS, paperGuidance, resolvePaper } from './paper'
import { useDirtyClose } from '../../lib/dirty'
import { Link, useSearchParams } from 'react-router'
import { PaperSheet } from './PaperSheet'
import { useBillingQuery, type BillDetail, type InvoiceSettings } from '../queries'

import { pricingSettingsProblems, PRICING_SETTING_KEYS } from './pricingDefaults'
import { assertSettingsRevisionSupport, rebaseSettings, requireSettingsRevision, settingsChanges, settingsReview } from './settingsRevision'

type Change = components['schemas']['InvoiceSettingsIn']
type ShowKey = keyof NonNullable<Change['show']>

const GROUPS: { title: string; keys: [ShowKey, string][] }[] = [
  { title: 'Shop', keys: [['show_shop_name', 'Shop name'], ['show_shop_address', 'Address'], ['show_shop_phone', 'Phone'], ['show_shop_email', 'Email'], ['show_shop_gstin', 'GSTIN'], ['show_shop_logo', 'Logo']] },
  { title: 'Customer', keys: [['show_customer_name', 'Name'], ['show_customer_legal_name', 'GST legal name'], ['show_customer_address', 'Address'], ['show_customer_phone', 'Phone'], ['show_customer_gstin', 'GSTIN'], ['show_customer_place_of_supply', 'State']] },
  { title: 'Invoice details', keys: [['show_invoice_title', 'Title'], ['show_invoice_number', 'Invoice number'], ['show_invoice_date', 'Date'], ['show_invoice_place_of_supply', 'Place of supply'], ['show_invoice_supply_type', 'Intra / inter-state']] },
  { title: 'Item columns', keys: [['show_item_serial_column', 'Serial number'], ['show_item_name_column', 'Item name'], ['show_hsn_column', 'HSN / SAC'], ['show_quantity_column', 'Quantity'], ['show_rate_column', 'Rate'], ['show_gst_percent_column', 'GST %'], ['show_gst_amount_column', 'GST amount'], ['show_amount_column', 'Amount']] },
  { title: 'Totals', keys: [['show_subtotal', 'Subtotal'], ['show_discount', 'Discount'], ['show_taxable_amount', 'Taxable value'], ['show_cgst_sgst_igst', 'CGST / SGST / IGST'], ['show_grand_total', 'Grand total and round-off']] },
  { title: 'Extras', keys: [['show_amount_in_words', 'Amount in words'], ['show_hsn_summary', 'Tax summary by HSN'], ['show_payment_details', 'Payments and balance due'], ['show_upi_qr', 'UPI QR for the balance due'], ['show_footer_text', 'Footer text'], ['show_digital_signature', 'Signature']] },
]

const TABS = [
  { id: 'shop', label: 'Shop details' },
  { id: 'pricing', label: 'Pricing & tax' },
  { id: 'invoice', label: 'Invoice appearance' },
  { id: 'printing', label: 'Printing' },
] as const
type TabId = (typeof TABS)[number]['id']

const SCHEMES = [
  { value: 'regular', label: 'Regular GST', note: 'GST is charged on invoices; they print as Tax Invoices.' },
  { value: 'composition', label: 'Composition scheme', note: 'No GST on invoices; they print as Bills of Supply with the composition note.' },
  { value: 'unregistered', label: 'Not GST-registered', note: 'No GST on invoices; GST paid on purchases is part of your cost.' },
] as const

/** A sample bill for the preview, so the layout can be judged before any real sale.
 * Its figures are fixed sample numbers, never a calculation. */
function sample(gst: boolean): BillDetail {
  const tax = (v: string) => (gst ? v : '0.00')
  const bill = {
    uuid: 'sample', bill_number: 'INV/2627/0042', bill_type: 'b2c', document_type: 'invoice', customer_name: 'Ravi Kumar',
    customer_phone: '98765 43210', customer_gstin: null, customer_gst_legal_name: null, customer_address_snapshot: 'Shivaji Nagar, Pune',
    place_of_supply_state_code: '27', subtotal_amount: '328.00', discount_percent: '0', discount_amount: '0.00',
    taxable_amount: gst ? '300.00' : '328.00', cgst_amount: tax('14.00'), sgst_amount: tax('14.00'), igst_amount: '0.00',
    round_off_amount: '0.00', total_amount: '328.00', paid_amount: '200.00', balance_due: '128.00', payment_status: 'partial',
    payment_method: 'cash', cancelled: false, cancel_reason: null, created_at: new Date().toISOString(), item_count: 3,
    lifecycle_status: 'finalized', original_bill_number: null, original_bill_uuid: null,
  }
  const item = (uuid: string, name: string, hsn: string, quantity: string, unit: string, rate: string, taxable: string, line_gst: string, percent: string) => ({
    uuid, product_uuid: uuid, product_name: name, hsn_code: hsn, unit, quantity, selling_price: rate, subtotal: rate,
    taxable_value: taxable, gst: line_gst, gst_percent: gst ? percent : null, line_taxable_value: gst ? taxable : String((Number(rate) * Number(quantity)).toFixed(2)),
    line_gst: tax(line_gst), amount: String((Number(rate) * Number(quantity)).toFixed(2)), cgst: '0', sgst: '0', igst: '0', original_item_uuid: null,
  })
  return {
    bill,
    items: [item('a', 'Basmati Rice 1 kg', '1006', '2', 'pkt', '105.00', '200.00', '10.00', '5'), item('b', 'Mustard Oil 1 L', '1514', '1', 'btl', '118.00', '100.00', '18.00', '18')],
    payments: [{ uuid: 'p', amount: '200.00', payment_method: 'cash', payment_reference: null, notes: null, received_at: bill.created_at }],
    credit_notes: [], history: [],
  } as unknown as BillDetail
}

function ImagePicker({ label, hint, box, value, shown, disabled, onChange, onShow }: { label: string; hint?: string; box: [number, number]; value: string | null; shown: boolean; disabled: boolean; onChange: (v: string | null) => void; onShow: (on: boolean) => void }) {
  const [problem, setProblem] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const src = imageSrc(value)
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setProblem(null)
    setWorking(true)
    try { onChange(await prepareImage(file, box[0], box[1])) } catch (err) { setProblem(err instanceof Error ? err.message : 'This picture could not be used.') } finally { setWorking(false) }
  }
  return <div className="image-picker">
    <strong>{label}</strong>
    <div className="image-picker-box">{src ? <img src={src} alt={`${label} preview`} /> : <span className="muted">No {label.toLowerCase()} yet</span>}</div>
    <div className="image-picker-actions">
      <label className={`button secondary${disabled || working ? ' disabled' : ''}`}>{working ? 'Preparing…' : src ? 'Change picture' : 'Choose picture'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={disabled || working} onChange={e => void pick(e)} /></label>
      {src && <button type="button" className="link danger-link" disabled={disabled} onClick={() => onChange(null)}>Remove</button>}
    </div>
    {src && <label className="check"><input type="checkbox" checked={shown} disabled={disabled} onChange={e => onShow(e.target.checked)} />Show on invoices</label>}
    {hint && <small className="hint">{hint}</small>}
    {problem && <small className="field-error" role="alert">{problem}</small>}
  </div>
}

export function InvoiceSettingsPage() {
  const user = useAuth().user?.id ?? ''
  const scope = `${user}/${useShop().current?.shop_id ?? ''}`
  const query = useBillingQuery<InvoiceSettings>('invoice-settings', 'invoice-settings')
  if (query.isPending) return <Loading label="Loading shop settings…" />
  if (!query.data) return <Alert>Shop settings could not be loaded. <button className="link" onClick={() => void query.refetch()}>Retry</button></Alert>
  return <>
    {query.error && <Alert>Latest settings could not be refreshed. Your edits are kept. <button className="link" onClick={() => void query.refetch()}>Retry refresh</button></Alert>}
    <Editor key={scope} saved={query.data} />
  </>
}

function Editor({ saved }: { saved: InvoiceSettings }) {
  const shop = useShop().current?.shop_id ?? ''
  const client = useQueryClient()
  const { busy, error, run, setError, fieldErrors } = useAction()
  const [problems, setProblems] = useState<Record<string, string>>({})
  const { ref: formRef, focusFirstError } = useFirstError()
  const [done, setDone] = useState(false)
  const [paper, setPaper] = useState<Paper>(resolvePaper(saved.paper_size))
  const [params] = useSearchParams()
  const wanted = TABS.find(t => t.id === params.get('tab'))?.id
  const [tab, setTab] = useState<TabId>(wanted ?? 'shop')
  const [baseline, setBaseline] = useState<InvoiceSettings>(saved)
  const [draft, setDraft] = useState<InvoiceSettings>(saved)
  const [stale, setStale] = useState(false)
  const [latest, setLatest] = useState<InvoiceSettings | null>(null)
  const sending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const set = <K extends keyof InvoiceSettings>(key: K, value: InvoiceSettings[K]) => { setDraft({ ...draft, [key]: value }); setDone(false); if (problems[key]) setProblems({ ...problems, [key]: '' }) }
  const err = (key: string) => problems[key] || fieldErrors[key] || undefined
  const text = (key: 'shop_name' | 'shop_address' | 'shop_phone' | 'shop_email' | 'shop_gstin' | 'invoice_title' | 'footer_text' | 'upi_id' | 'terms_text' | 'bank_details') =>
    (e: { target: { value: string } }) => set(key, (key === 'shop_gstin' ? e.target.value.toUpperCase() : e.target.value) as never)
  const preview: InvoiceSettings = { ...draft, gst_registered: draft.gst_scheme === 'regular', invoice_title: draft.invoice_title || 'TAX INVOICE' }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (sending.current || stale) return
    const found: Record<string, string> = pricingSettingsProblems(baseline, draft)
    if (!draft.shop_name.trim()) found.shop_name = 'Enter the shop name.'
    const checks: [string, string | null][] = [['shop_phone', shopPhoneProblem(draft.shop_phone ?? '')], ['shop_email', emailProblem(draft.shop_email ?? '')], ['shop_gstin', gstinProblem(draft.shop_gstin ?? '')], ['upi_id', upiProblem(draft.upi_id ?? '')]]
    for (const [key, problem] of checks) if (problem) found[key] = problem
    setProblems(found)
    if (Object.keys(found).length) { if (PRICING_SETTING_KEYS.some(key => found[key])) setTab('pricing'); setError('Some details need fixing. They are marked below.'); focusFirstError(); return }
    setError(null)
    const change = settingsChanges(baseline, draft)
    if (!Object.keys(change).length) { setDone(true); return }
    sending.current = true
    let result: InvoiceSettings | undefined
    try {
      result = await run(async () => {
        const revision = requireSettingsRevision(baseline)
        await assertSettingsRevisionSupport(shop)
        if (!mounted.current) return
        try { return await api.patch<InvoiceSettings>(`/v1/shops/${shop}/invoice-settings`, { ...change, expected_revision: revision }) }
        catch (failure) {
          if (mounted.current && failure instanceof ApiError && failure.code === 'settings_changed') { setStale(true); setLatest(null) }
          throw failure
        }
      })
    } finally { sending.current = false }
    if (!mounted.current) return
    if (result) {
      setDraft(result)
      setBaseline(result)
      setDone(true)
      client.setQueryData(['invoice-settings', shop, 'invoice-settings'], result)
      const keys = ['bill-preview', ...(PRICING_SETTING_KEYS.some(key => key in change) ? ['price-preview', 'products', 'product'] : [])]
      await Promise.all(keys.map(key => client.invalidateQueries({ queryKey: [key, shop] })))
    }
  }

  const changed = Object.keys(settingsChanges(baseline, draft)).length > 0
  useDirtyClose(changed, () => undefined)
  const show = (id: TabId) => ({ hidden: tab !== id, role: 'tabpanel' as const, 'aria-labelledby': `tab-${id}` })
  return <div className="settings-page">
    <PageHeader eyebrow="SHOP SETTINGS" title="Shop and invoice" description="Your shop's details and how invoices look. Saved settings also reach your phones when they sync." />
    <div className="settings-grid">
      <form ref={formRef} className="settings-form" onSubmit={save} noValidate aria-busy={busy}>
        <div role="tablist" aria-label="Settings sections" className="settings-tabs">
          {TABS.map(t => <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} className={tab === t.id ? 'active' : undefined} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>
        <fieldset disabled={busy}>
          <section className="card wide" {...show('shop')}>
            <h2>Shop details</h2>
            <Field label="Shop name" required maxLength={120} value={draft.shop_name} onChange={text('shop_name')} error={err('shop_name')} />
            <label className="field-block">Address<textarea rows={2} maxLength={500} value={draft.shop_address ?? ''} onChange={text('shop_address')} /></label>
            <div className="form-grid">
              <Field label="Phone" type="tel" inputMode="tel" maxLength={30} error={err('shop_phone')} value={draft.shop_phone ?? ''} onChange={text('shop_phone')} />
              <Field label="Email" type="email" maxLength={254} error={err('shop_email')} value={draft.shop_email ?? ''} onChange={text('shop_email')} />
              <Field label="GSTIN" maxLength={15} placeholder="27ABCDE1234F1Z5" error={err('shop_gstin')} value={draft.shop_gstin ?? ''} onChange={text('shop_gstin')} hint="15 characters, starting with your state code." />
            </div>
          </section>

          <section className="card wide" {...show('shop')}>
            <h2>Logo and signature</h2>
            <p className="muted">PNG or JPG. Large pictures are made smaller (up to 400 KB, as on the phone).</p>
            <div className="image-pickers">
              <ImagePicker label="Shop logo" box={[600, 300]} value={draft.shop_logo ?? null} shown={draft.show.show_shop_logo !== false} disabled={busy}
                onChange={v => setDraft({ ...draft, shop_logo: v, show: v ? { ...draft.show, show_shop_logo: true } : draft.show })}
                onShow={on => set('show', { ...draft.show, show_shop_logo: on })} />
              <ImagePicker label="Signature" box={[600, 200]} value={draft.digital_signature ?? null} shown={draft.show.show_digital_signature === true} disabled={busy}
                hint="Printed above Authorised signatory on A4 and A5."
                onChange={v => setDraft({ ...draft, digital_signature: v, show: { ...draft.show, show_digital_signature: !!v } })}
                onShow={on => set('show', { ...draft.show, show_digital_signature: on })} />
            </div>
          </section>

          <section className="card wide" {...show('pricing')}>
            <h2>Tax and pricing defaults</h2>
            <fieldset className="scheme-choice">
              <legend>GST registration</legend>
              {SCHEMES.map(sc => <label key={sc.value} className="check"><input type="radio" name="scheme" checked={draft.gst_scheme === sc.value} onChange={() => set('gst_scheme', sc.value)} /><span><strong>{sc.label}</strong><br /><small className="muted">{sc.note}</small></span></label>)}
              {draft.gst_scheme !== saved.gst_scheme && <Alert kind="info">This changes how new bills are taxed and priced. Bills already made keep their tax.</Alert>}
            </fieldset>
            <div className="form-grid">
              <Field label="Default GST %" inputMode="decimal" value={draft.default_gst_percent ?? '18'} onChange={e => set('default_gst_percent', e.target.value)} error={err('default_gst_percent')} hint="Used when the product and category have no GST rate. Supported rates: 0, 0.25, 3, 5, 12, 18, 28 and 40%." />
              <Field label="Default profit margin %" inputMode="decimal" value={draft.default_profit_margin_percent ?? '0'} onChange={e => set('default_profit_margin_percent', e.target.value)} error={err('default_profit_margin_percent')} hint="Added to total cost when product and category margins are unset. From 0 to 100%, with up to three decimal places." />
              <Field label="Default overhead cost (₹)" inputMode="decimal" value={draft.default_overhead_cost ?? '0'} onChange={e => set('default_overhead_cost', e.target.value)} error={err('default_overhead_cost')} hint="Per unit, when product and category overheads are unset. Up to two decimal places." />
            </div>
            <label className="check"><input type="checkbox" checked={draft.round_off_total} onChange={e => set('round_off_total', e.target.checked)} />Round totals to the nearest rupee (new bills)</label>
            <Alert kind="info">Changing these affects new invoices only. Issued invoices keep their saved prices, tax and totals.</Alert>
          </section>

          <section className="card wide" {...show('invoice')}>
            <h2>Invoice</h2>
            <div className="form-grid">
              <Field label="Title" maxLength={40} placeholder="Automatic" value={draft.invoice_title === 'TAX INVOICE' ? '' : draft.invoice_title} onChange={text('invoice_title')} hint="Leave blank for the standard title: Tax Invoice, Bill of Supply or Bill." />
              <Field label="UPI id" maxLength={100} placeholder="shopname@okaxis" error={err('upi_id')} value={draft.upi_id ?? ''} onChange={text('upi_id')} hint="Unpaid bills show a QR to pay the balance." />
            </div>
            <label className="field-block">Bank details<textarea rows={3} maxLength={500} placeholder={'Account name\nAccount number · IFSC\nBank and branch'} value={draft.bank_details ?? ''} onChange={text('bank_details')} /></label>
            <label className="field-block">Terms<textarea rows={2} maxLength={1000} placeholder="Goods once sold will not be taken back." value={draft.terms_text ?? ''} onChange={text('terms_text')} /></label>
            <Field label="Footer" maxLength={300} value={draft.footer_text} onChange={text('footer_text')} />
          </section>

          <section className="card wide" {...show('invoice')}>
            <h2>What the invoice shows</h2>
            <div className="show-groups">{GROUPS.map(g => <fieldset key={g.title}><legend>{g.title}</legend>{g.keys.map(([key, label]) => <label key={key} className="check"><input type="checkbox" checked={draft.show[key] !== false} onChange={e => set('show', { ...draft.show, [key]: e.target.checked })} />{label}</label>)}</fieldset>)}</div>
          </section>
          <section className="card wide" {...show('printing')}>
            <h2>Printing</h2>
            <label>Default paper<select value={resolvePaper(draft.paper_size)} onChange={e => { const p = PAPERS.find(x => x.value === e.target.value)!; set('paper_size', p.setting); setPaper(p.value) }}>{PAPERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
            <p className="muted">{paperGuidance(resolvePaper(draft.paper_size))}</p>
            <p className="muted">New invoices, reloads and the PDF open on this paper. Staff can pick another paper for a single print without changing it. Use the preview to check long names and line counts before printing on hardware.</p>
          </section>
          <p className="muted">Team access is managed under <Link to="/team">Team &amp; permissions</Link>; plan and renewal under <Link to="/subscription">Subscription</Link>.</p>
        </fieldset>
        <div className="settings-save">
          {error && <Alert>{error}</Alert>}
          {stale && <>
            <p>Your settings edits are kept. Review the latest saved settings before choosing how to continue.</p>
            <Button disabled={busy} onClick={async () => {
              const result = await run(async () => {
                const value = await api.get<InvoiceSettings>(`/v1/shops/${shop}/invoice-settings`)
                requireSettingsRevision(value)
                return value
              })
              if (result && mounted.current) setLatest(result)
            }}>Review latest settings</Button>
          </>}
          {stale && latest && <section aria-label="Latest settings review">
            <p>These are your edited fields. Other changes in the latest settings will be kept.</p>
            <div className="table-wrap"><table className="table"><thead><tr><th>Field</th><th>Latest value</th><th>Your value</th></tr></thead><tbody>{settingsReview(baseline, draft, latest).map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.current}</td><td>{row.mine}</td></tr>)}</tbody></table></div>
            <Button onClick={() => {
              const merged = rebaseSettings(baseline, draft, latest)
              setDraft(merged); setBaseline(latest); setPaper(resolvePaper(merged.paper_size)); setLatest(null); setStale(false); setError(null); setDone(false)
            }}>Keep my edits with latest settings</Button>
          </section>}

          {done && !changed && <Alert kind="success">Saved. Phones get the new layout on their next sync.</Alert>}
          <Button type="submit" variant="primary" disabled={busy || stale || !changed}>{busy ? 'Saving…' : 'Save settings'}</Button>
          {changed && <><span className="unsaved" role="status">Unsaved changes</span><Button disabled={busy} onClick={() => { const discarded = latest ?? saved; setBaseline(discarded); setDraft(discarded); setPaper(resolvePaper(discarded.paper_size)); setDone(false); setStale(false); setLatest(null); setError(null) }}>Discard changes</Button></>}
        </div>
      </form>
      <aside className="settings-preview" aria-label="Invoice preview">
        <div className="settings-preview-head"><strong>Preview</strong><span className="muted">Sample bill</span>
          <select aria-label="Preview paper" value={paper} onChange={e => setPaper(e.target.value as Paper)}><option value="A4">A4</option><option value="A5">A5</option><option value="80mm">Receipt 80 mm</option><option value="58mm">Receipt 58 mm</option></select>
        </div>
        <PaperSheet paper={paper}><InvoiceDocument detail={sample(draft.gst_scheme === 'regular')} settings={preview} paper={paper} /></PaperSheet>
      </aside>
    </div>
  </div>
}
