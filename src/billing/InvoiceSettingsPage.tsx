import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api } from '../api/client'
import type { components } from '../api/schema'
import { Alert, Field, Loading } from '../components/ui'
import { useAction } from '../components/useAction'
import { useFirstError } from '../components/useFirstError'
import { emailProblem, gstinProblem, shopPhoneProblem, upiProblem } from '../lib/validate'
import { Button, PageHeader } from '../components/workspace'
import { useShop } from '../shops/context'
import { InvoiceDocument, type Paper } from './InvoiceDocument'
import { useBillingQuery, type BillDetail, type InvoiceSettings } from './queries'

type Change = components['schemas']['InvoiceSettingsIn']
type ShowKey = keyof NonNullable<Change['show']>

const GROUPS: { title: string; keys: [ShowKey, string][] }[] = [
  { title: 'Shop', keys: [['show_shop_name', 'Shop name'], ['show_shop_address', 'Address'], ['show_shop_phone', 'Phone'], ['show_shop_email', 'Email'], ['show_shop_gstin', 'GSTIN']] },
  { title: 'Customer', keys: [['show_customer_name', 'Name'], ['show_customer_legal_name', 'GST legal name'], ['show_customer_address', 'Address'], ['show_customer_phone', 'Phone'], ['show_customer_gstin', 'GSTIN'], ['show_customer_place_of_supply', 'State']] },
  { title: 'Invoice details', keys: [['show_invoice_title', 'Title'], ['show_invoice_number', 'Invoice number'], ['show_invoice_date', 'Date'], ['show_invoice_place_of_supply', 'Place of supply'], ['show_invoice_supply_type', 'Intra / inter-state']] },
  { title: 'Item columns', keys: [['show_item_serial_column', 'Serial number'], ['show_item_name_column', 'Item name'], ['show_hsn_column', 'HSN / SAC'], ['show_quantity_column', 'Quantity'], ['show_rate_column', 'Rate'], ['show_gst_percent_column', 'GST %'], ['show_gst_amount_column', 'GST amount'], ['show_amount_column', 'Amount']] },
  { title: 'Totals', keys: [['show_subtotal', 'Subtotal'], ['show_discount', 'Discount'], ['show_taxable_amount', 'Taxable value'], ['show_cgst_sgst_igst', 'CGST / SGST / IGST'], ['show_grand_total', 'Grand total and round-off']] },
  { title: 'Extras', keys: [['show_amount_in_words', 'Amount in words'], ['show_hsn_summary', 'Tax summary by HSN'], ['show_payment_details', 'Payments and balance due'], ['show_upi_qr', 'UPI QR for the balance due'], ['show_footer_text', 'Footer text']] },
]

// Paper widths at 96 dpi: the preview lays the page out at its real width, then shrinks it.
const PAPER_PX: Record<Paper, number> = { A4: 794, A5: 559, '80mm': 302, '58mm': 219 }

function ScaledSheet({ paper, children }: { paper: Paper; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const fit = () => setScale(Math.min(1, (el.clientWidth - 32) / PAPER_PX[paper]))
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    return () => watch.disconnect()
  }, [paper])
  return <div ref={box} className="settings-preview-sheet"><div style={{ width: PAPER_PX[paper], zoom: scale }}>{children}</div></div>
}

const SCHEMES = [
  { value: 'regular', label: 'Regular GST', note: 'GST is charged on bills; invoices are Tax Invoices.' },
  { value: 'composition', label: 'Composition scheme', note: 'No GST on bills; invoices are Bills of Supply with the composition note.' },
  { value: 'unregistered', label: 'Not GST-registered', note: 'No GST on bills; GST paid on purchases is part of your cost.' },
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

export function InvoiceSettingsPage() {
  const query = useBillingQuery<InvoiceSettings>('invoice-settings', 'invoice-settings')
  if (query.isPending) return <Loading label="Loading shop settings…" />
  if (query.error || !query.data) return <Alert>Shop settings could not be loaded. <button className="link" onClick={() => void query.refetch()}>Retry</button></Alert>
  return <Editor saved={query.data} />
}

function Editor({ saved }: { saved: InvoiceSettings }) {
  const shop = useShop().current?.shop_id ?? ''
  const client = useQueryClient()
  const { busy, error, run, setError, fieldErrors } = useAction()
  const [problems, setProblems] = useState<Record<string, string>>({})
  const { ref: formRef, focusFirstError } = useFirstError()
  const [done, setDone] = useState(false)
  const [paper, setPaper] = useState<Paper>(saved.paper_size === 'a5' ? 'A5' : 'A4')
  const [draft, setDraft] = useState<InvoiceSettings>(saved)
  const set = <K extends keyof InvoiceSettings>(key: K, value: InvoiceSettings[K]) => { setDraft({ ...draft, [key]: value }); setDone(false); if (problems[key]) setProblems({ ...problems, [key]: '' }) }
  const err = (key: string) => problems[key] || fieldErrors[key] || undefined
  const text = (key: 'shop_name' | 'shop_address' | 'shop_phone' | 'shop_email' | 'shop_gstin' | 'invoice_title' | 'footer_text' | 'upi_id' | 'terms_text' | 'bank_details') =>
    (e: { target: { value: string } }) => set(key, (key === 'shop_gstin' ? e.target.value.toUpperCase() : e.target.value) as never)
  const preview: InvoiceSettings = { ...draft, gst_registered: draft.gst_scheme === 'regular', invoice_title: draft.invoice_title || 'TAX INVOICE' }

  async function save(event: FormEvent) {
    event.preventDefault()
    const found: Record<string, string> = {}
    if (!draft.shop_name.trim()) found.shop_name = 'Enter the shop name.'
    const checks: [string, string | null][] = [['shop_phone', shopPhoneProblem(draft.shop_phone ?? '')], ['shop_email', emailProblem(draft.shop_email ?? '')], ['shop_gstin', gstinProblem(draft.shop_gstin ?? '')], ['upi_id', upiProblem(draft.upi_id ?? '')]]
    for (const [key, problem] of checks) if (problem) found[key] = problem
    setProblems(found)
    if (Object.keys(found).length) { setError('Some details need fixing. They are marked below.'); focusFirstError(); return }
    setError(null)
    // Send only what changed, so a field edited on a phone meanwhile is left alone.
    const change: Record<string, unknown> = {}
    for (const key of ['shop_name', 'shop_address', 'shop_phone', 'shop_email', 'shop_gstin', 'gst_scheme', 'invoice_title', 'footer_text', 'paper_size', 'upi_id', 'terms_text', 'bank_details', 'round_off_total'] as const) {
      if ((draft[key] ?? '') !== (saved[key] ?? '')) change[key] = typeof draft[key] === 'string' ? (draft[key] as string).trim() || null : draft[key]
    }
    const show = Object.fromEntries(Object.entries(draft.show).filter(([k, v]) => saved.show[k] !== v))
    if (Object.keys(show).length) change.show = show
    if (!Object.keys(change).length) { setDone(true); return }
    const result = await run(() => api.patch<InvoiceSettings>(`/v1/shops/${shop}/invoice-settings`, change))
    if (result) {
      setDraft(result)
      setDone(true)
      client.setQueryData(['invoice-settings', shop, 'invoice-settings'], result)
      await client.invalidateQueries({ queryKey: ['bill-preview', shop] })
    }
  }

  const changed = JSON.stringify(draft) !== JSON.stringify(saved)
  return <div className="settings-page">
    <PageHeader eyebrow="SHOP SETTINGS" title="Shop and invoice" description="Your shop's details and how invoices look. Saved settings also reach your phones when they sync." />
    <div className="settings-grid">
      <form ref={formRef} className="settings-form" onSubmit={save} noValidate aria-busy={busy}>
        <fieldset disabled={busy}>
          <section className="card wide">
            <h2>Shop details</h2>
            <Field label="Shop name" required maxLength={120} value={draft.shop_name} onChange={text('shop_name')} error={err('shop_name')} />
            <label className="field-block">Address<textarea rows={2} maxLength={500} value={draft.shop_address ?? ''} onChange={text('shop_address')} /></label>
            <div className="form-grid">
              <Field label="Phone" type="tel" inputMode="tel" maxLength={30} error={err('shop_phone')} value={draft.shop_phone ?? ''} onChange={text('shop_phone')} />
              <Field label="Email" type="email" maxLength={254} error={err('shop_email')} value={draft.shop_email ?? ''} onChange={text('shop_email')} />
              <Field label="GSTIN" maxLength={15} placeholder="27ABCDE1234F1Z5" error={err('shop_gstin')} value={draft.shop_gstin ?? ''} onChange={text('shop_gstin')} hint="15 characters, starting with your state code." />
            </div>
            <fieldset className="scheme-choice">
              <legend>GST registration</legend>
              {SCHEMES.map(sc => <label key={sc.value} className="check"><input type="radio" name="scheme" checked={draft.gst_scheme === sc.value} onChange={() => set('gst_scheme', sc.value)} /><span><strong>{sc.label}</strong><br /><small className="muted">{sc.note}</small></span></label>)}
              {draft.gst_scheme !== saved.gst_scheme && <Alert kind="info">This changes how new bills are taxed and priced. Bills already made keep their tax.</Alert>}
            </fieldset>
          </section>

          <section className="card wide">
            <h2>Invoice</h2>
            <div className="form-grid">
              <Field label="Title" maxLength={40} placeholder="Automatic" value={draft.invoice_title === 'TAX INVOICE' ? '' : draft.invoice_title} onChange={text('invoice_title')} hint="Leave blank for the standard title: Tax Invoice, Bill of Supply or Bill." />
              <label>Default paper<select value={draft.paper_size} onChange={e => { set('paper_size', e.target.value); setPaper(e.target.value === 'a5' ? 'A5' : 'A4') }}><option value="a4">A4</option><option value="a5">A5</option></select></label>
              <Field label="UPI id" maxLength={100} placeholder="shopname@okaxis" error={err('upi_id')} value={draft.upi_id ?? ''} onChange={text('upi_id')} hint="Unpaid bills show a QR to pay the balance." />
            </div>
            <label className="check"><input type="checkbox" checked={draft.round_off_total} onChange={e => set('round_off_total', e.target.checked)} />Round totals to the nearest rupee (new bills)</label>
            <label className="field-block">Bank details<textarea rows={3} maxLength={500} placeholder={'Account name\nAccount number · IFSC\nBank and branch'} value={draft.bank_details ?? ''} onChange={text('bank_details')} /></label>
            <label className="field-block">Terms<textarea rows={2} maxLength={1000} placeholder="Goods once sold will not be taken back." value={draft.terms_text ?? ''} onChange={text('terms_text')} /></label>
            <Field label="Footer" maxLength={300} value={draft.footer_text} onChange={text('footer_text')} />
          </section>

          <section className="card wide">
            <h2>What the invoice shows</h2>
            <div className="show-groups">{GROUPS.map(g => <fieldset key={g.title}><legend>{g.title}</legend>{g.keys.map(([key, label]) => <label key={key} className="check"><input type="checkbox" checked={draft.show[key] !== false} onChange={e => set('show', { ...draft.show, [key]: e.target.checked })} />{label}</label>)}</fieldset>)}</div>
          </section>
        </fieldset>
        <div className="settings-save">
          {error && <Alert>{error}</Alert>}
          {done && !changed && <Alert kind="success">Saved. Phones get the new layout on their next sync.</Alert>}
          <Button type="submit" variant="primary" disabled={busy || !changed}>{busy ? 'Saving…' : 'Save settings'}</Button>
          {changed && <Button disabled={busy} onClick={() => { setDraft(saved); setDone(false) }}>Discard changes</Button>}
        </div>
      </form>
      <aside className="settings-preview" aria-label="Invoice preview">
        <div className="settings-preview-head"><strong>Preview</strong><span className="muted">Sample bill</span>
          <select aria-label="Preview paper" value={paper} onChange={e => setPaper(e.target.value as Paper)}><option value="A4">A4</option><option value="A5">A5</option><option value="80mm">Receipt 80 mm</option><option value="58mm">Receipt 58 mm</option></select>
        </div>
        <ScaledSheet paper={paper}><InvoiceDocument detail={sample(draft.gst_scheme === 'regular')} settings={preview} paper={paper} /></ScaledSheet>
      </aside>
    </div>
  </div>
}
