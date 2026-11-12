import { useState } from 'react'
import { useBillingQuery, type InvoiceSettings } from '../queries'
import type { Paper } from './InvoiceDocument'

export const PAPERS: { value: Paper; setting: 'a4' | 'a5' | '80mm' | '58mm'; label: string; guidance: string }[] = [
  { value: 'A4', setting: 'a4', label: 'A4', guidance: '210 × 297 mm sheet · Print at 100% scale with default margins.' },
  { value: 'A5', setting: 'a5', label: 'A5', guidance: '148 × 210 mm half-sheet · Print at 100% scale with default margins.' },
  { value: '80mm', setting: '80mm', label: 'Receipt 80 mm', guidance: '80 mm thermal roll (~72 mm printable) · Set margins to None and scale to 100%.' },
  { value: '58mm', setting: '58mm', label: 'Receipt 58 mm', guidance: '58 mm thermal roll (~48 mm printable) · Set margins to None and scale to 100%.' },
]

export function resolvePaper(value: string | null | undefined): Paper {
  const v = (value ?? '').trim().toLowerCase()
  if (v === 'a5') return 'A5'
  if (v === '80mm') return '80mm'
  if (v === '58mm') return '58mm'
  return 'A4'
}

export function paperGuidance(paper: Paper): string {
  return PAPERS.find(p => p.value === paper)?.guidance ?? PAPERS[0]!.guidance
}

/** The shop's saved paper, and a choice for this print only. Picking here never changes the saved default. */
export function useInvoicePaper() {
  const settings = useBillingQuery<InvoiceSettings>('invoice-settings', 'invoice-settings')
  const [chosen, setChosen] = useState<Paper | null>(null)
  const saved = resolvePaper(settings.data?.paper_size)
  return { settings, paper: chosen ?? saved, saved, setPaper: setChosen }
}
