import { useState } from 'react'
import { useBillingQuery, type InvoiceSettings } from '../queries'
import type { Paper } from './InvoiceDocument'

export const PAPERS: { value: Paper; label: string }[] = [
  { value: 'A4', label: 'A4' }, { value: 'A5', label: 'A5' }, { value: '80mm', label: 'Receipt 80 mm' }, { value: '58mm', label: 'Receipt 58 mm' },
]

/** The shop's saved paper, and a choice for this print only. Picking here never changes the saved default. */
export function useInvoicePaper() {
  const settings = useBillingQuery<InvoiceSettings>('invoice-settings', 'invoice-settings')
  const [chosen, setChosen] = useState<Paper | null>(null)
  const saved = settings.data?.paper_size.toUpperCase() === 'A5' ? 'A5' : 'A4'
  return { settings, paper: chosen ?? saved, saved: saved as Paper, setPaper: setChosen }
}
