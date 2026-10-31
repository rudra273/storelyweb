import a4 from './paper-a4.css?url'
import a5 from './paper-a5.css?url'
import p80 from './paper-80mm.css?url'
import p58 from './paper-58mm.css?url'
import { useState } from 'react'
import { Link } from 'react-router'
import { Alert, Loading } from '../components/ui'
import { describeError } from '../components/useAction'
import { useShop } from '../shops/context'
import { can } from '../permissions'
import { InvoiceDocument, type Paper } from './InvoiceDocument'
import { useBillingQuery, type BillDetail, type InvoiceSettings } from './queries'

const SHEETS: Record<Paper, string> = { A4: a4, A5: a5, '80mm': p80, '58mm': p58 }

export function Invoice({ detail }: { detail: BillDetail }) {
  const query = useBillingQuery<InvoiceSettings>('invoice-settings', 'invoice-settings')
  const { role } = useShop()
  const [paper, setPaper] = useState<Paper | null>(null)
  if (query.isPending) return <Loading label="Loading invoice settings…" />
  if (query.error || !query.data) return <Alert>{describeError(query.error)}</Alert>
  const s = query.data
  const selected = paper ?? (s.paper_size.toUpperCase() === 'A5' ? 'A5' : 'A4')
  return <>
    <div className="actions no-print invoice-toolbar">
      <label>Paper size<select value={selected} onChange={e => setPaper(e.target.value as Paper)}><option value="A4">A4</option><option value="A5">A5</option><option value="80mm">Receipt 80 mm</option><option value="58mm">Receipt 58 mm</option></select></label>
      <button onClick={() => window.print()}>Print / Save as PDF</button>
      <span className="muted">Choose “Save as PDF” in the print dialog to download.</span>
      {can(role, 'shop.settings') && <Link to="/settings" className="invoice-settings-link">Change how invoices look</Link>}
    </div>
    <link rel="stylesheet" href={SHEETS[selected]} />
    <InvoiceDocument detail={detail} settings={s} paper={selected} />
  </>
}
