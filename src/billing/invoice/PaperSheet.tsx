import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Paper } from './InvoiceDocument'

// Paper widths at 96 dpi: the preview lays the page out at its real width, then shrinks it.
const PAPER_PX: Record<Paper, number> = { A4: 794, A5: 559, '80mm': 302, '58mm': 219 }

/** A page laid out at its real width, then shrunk to fit its box. Printing ignores the shrink. */
export function PaperSheet({ paper, children }: { paper: Paper; children: ReactNode }) {
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
  return <div ref={box} className="settings-preview-sheet paper-sheet"><div style={{ width: PAPER_PX[paper], zoom: scale }}>{children}</div></div>
}
