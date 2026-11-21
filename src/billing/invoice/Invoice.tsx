import a4 from './paper-a4.css?url'
import a5 from './paper-a5.css?url'
import p80 from './paper-80mm.css?url'
import p58 from './paper-58mm.css?url'
import { Alert, Loading } from '../../components/ui/ui'
import { describeError } from '../../components/useAction'
import { InvoiceDocument, type Paper } from './InvoiceDocument'
import { PaperSheet } from './PaperSheet'
import type { BillDetail } from '../queries'
import type { useInvoicePaper } from './paper'

const SHEETS: Record<Paper, string> = { A4: a4, A5: a5, '80mm': p80, '58mm': p58 }
/** The invoice as it will print. Preview and print share this one renderer and its paper rules. */
export function InvoiceSheet({ detail, settings, paper }: { detail: BillDetail; settings: ReturnType<typeof useInvoicePaper>['settings']; paper: Paper }) {
  if (settings.isPending) return <Loading label="Loading invoice settings…" />
  if (settings.error || !settings.data) return <Alert>{describeError(settings.error)} <button type="button" className="link" onClick={() => void settings.refetch()}>Retry</button></Alert>
  return <>
    <link rel="stylesheet" href={SHEETS[paper]} />
    <PaperSheet paper={paper}><InvoiceDocument detail={detail} settings={settings.data} paper={paper} /></PaperSheet>
  </>
}
