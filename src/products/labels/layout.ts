/**
 * How labels sit on the paper. All sizes are millimetres, so what is previewed is the size that
 * prints. Label printers are set up here, separately from the invoice paper (receipts, A4, A5).
 */
export interface Layout {
  /** A sheet of adhesive labels on A4, or a roll that feeds one label at a time. */
  kind: 'sheet' | 'roll'
  width: number
  height: number
  cols: number
  rows: number
  /** Gap between the sheet's edge and the first label. */
  top: number
  left: number
  /** Gap between labels. */
  gapX: number
  gapY: number
}

export interface Preset { id: string; label: string; layout: Layout }

export const A4 = { width: 210, height: 297 }

export const PRESETS: Preset[] = [
  { id: 'a4-24', label: 'A4 sheet, 24 labels (70 × 37 mm)', layout: { kind: 'sheet', width: 70, height: 37, cols: 3, rows: 8, top: 0, left: 0, gapX: 0, gapY: 0 } },
  { id: 'a4-65', label: 'A4 sheet, 65 labels (38 × 21 mm)', layout: { kind: 'sheet', width: 38.1, height: 21.2, cols: 5, rows: 13, top: 10.7, left: 4.7, gapX: 2.5, gapY: 0 } },
  { id: 'roll-50x25', label: 'Roll, 50 × 25 mm', layout: { kind: 'roll', width: 50, height: 25, cols: 1, rows: 1, top: 0, left: 0, gapX: 0, gapY: 0 } },
  { id: 'roll-38x25', label: 'Roll, 38 × 25 mm', layout: { kind: 'roll', width: 38, height: 25, cols: 1, rows: 1, top: 0, left: 0, gapX: 0, gapY: 0 } },
]
export const CUSTOM_ID = 'custom'
export const DEFAULT_PRESET = PRESETS[0]!

/** The largest number of labels one print run takes, so a typo cannot print a forest. */
export const MAX_LABELS = 600

export function labelsPerPage(l: Layout): number {
  return l.kind === 'roll' ? 1 : l.cols * l.rows
}

/** A problem with the layout in words, or null when it will print where it should. */
export function layoutProblem(l: Layout): string | null {
  const positive: [number, string][] = [[l.width, 'width'], [l.height, 'height']]
  for (const [n, name] of positive) if (!Number.isFinite(n) || n < 10 || n > 200) return `The label ${name} must be between 10 and 200 mm.`
  for (const n of [l.top, l.left, l.gapX, l.gapY]) if (!Number.isFinite(n) || n < 0 || n > 100) return 'Margins and gaps must be between 0 and 100 mm.'
  if (l.kind === 'roll') return null
  if (!Number.isInteger(l.cols) || !Number.isInteger(l.rows) || l.cols < 1 || l.rows < 1 || l.cols > 12 || l.rows > 30) return 'Columns and rows must be whole numbers (up to 12 columns and 30 rows).'
  const usedWidth = l.left + l.cols * l.width + (l.cols - 1) * l.gapX
  const usedHeight = l.top + l.rows * l.height + (l.rows - 1) * l.gapY
  if (usedWidth > A4.width + 0.01) return `${l.cols} labels across need ${usedWidth.toFixed(1)} mm, but an A4 sheet is ${A4.width} mm wide.`
  if (usedHeight > A4.height + 0.01) return `${l.rows} rows down need ${usedHeight.toFixed(1)} mm, but an A4 sheet is ${A4.height} mm tall.`
  return null
}

/**
 * Splits labels into printed pages. A sheet starts at label `start` (1 is the first slot; a higher
 * number skips slots already used on a part-used sheet, which are left empty). A roll is one label per page.
 */
export function paginate<T>(labels: T[], l: Layout, start = 1): (T | null)[][] {
  const per = labelsPerPage(l)
  if (l.kind === 'roll') return labels.map(x => [x])
  // A layout still being typed (an empty or non-numeric column count) has no pages yet.
  if (!Number.isInteger(per) || per < 1) return []
  const skip = Math.min(Math.max(Math.floor(start) || 1, 1), per) - 1
  const cells: (T | null)[] = [...Array<null>(skip).fill(null), ...labels]
  const pages: (T | null)[][] = []
  for (let i = 0; i < cells.length; i += per) pages.push(cells.slice(i, i + per))
  return pages
}

/** The `@page` rule that makes the browser print at the real paper size with no margins of its own. */
export function pageRule(l: Layout): string {
  return l.kind === 'roll' ? `@page { size: ${l.width}mm ${l.height}mm; margin: 0; }` : `@page { size: A4 portrait; margin: 0; }`
}

export interface Options { price: boolean; shop: boolean }
export const DEFAULT_OPTIONS: Options = { price: true, shop: false }

export interface Saved { preset: string; custom: Layout; options: Options }

const key = (shop: string) => `storely.labels.v1:${shop}`

/** What was chosen last time on this device. Storage can be blocked, so any failure just means defaults. */
export function loadSaved(shop: string): Saved {
  const fallback: Saved = { preset: DEFAULT_PRESET.id, custom: DEFAULT_PRESET.layout, options: DEFAULT_OPTIONS }
  try {
    const raw = localStorage.getItem(key(shop))
    if (!raw) return fallback
    const saved = JSON.parse(raw) as Partial<Saved>
    const known = saved.preset === CUSTOM_ID || PRESETS.some(p => p.id === saved.preset)
    return {
      preset: known && saved.preset ? saved.preset : fallback.preset,
      custom: saved.custom && !layoutProblem(saved.custom) ? saved.custom : fallback.custom,
      options: { price: saved.options?.price ?? true, shop: saved.options?.shop ?? false },
    }
  } catch {
    return fallback
  }
}

export function save(shop: string, saved: Saved): void {
  try { localStorage.setItem(key(shop), JSON.stringify(saved)) } catch { /* not saved; defaults next time */ }
}

export function layoutOf(preset: string, custom: Layout): Layout {
  return preset === CUSTOM_ID ? custom : (PRESETS.find(p => p.id === preset) ?? DEFAULT_PRESET).layout
}
