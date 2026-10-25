/** Dates are the shop's local calendar days (`YYYY-MM-DD`), as on the phone. */
export type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'lastmonth' | 'year' | 'custom'

export const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'lastmonth', label: 'Last month' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom dates' },
]

export function localDay(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/** The first and last day of a preset, relative to `now`. `custom` has no fixed days. */
export function rangeFor(preset: Preset, now: Date = new Date()): { from: string; to: string } | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (preset) {
    case 'today':
      return { from: localDay(today), to: localDay(today) }
    case 'yesterday': {
      const y = addDays(today, -1)
      return { from: localDay(y), to: localDay(y) }
    }
    case 'week':
      return { from: localDay(addDays(today, -6)), to: localDay(today) }
    case 'month':
      return { from: localDay(new Date(today.getFullYear(), today.getMonth(), 1)), to: localDay(today) }
    case 'lastmonth':
      return {
        from: localDay(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: localDay(new Date(today.getFullYear(), today.getMonth(), 0)),
      }
    case 'year':
      return { from: localDay(new Date(today.getFullYear(), 0, 1)), to: localDay(today) }
    case 'custom':
      return null
  }
}

export function isDay(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00`)
  return !Number.isNaN(d.getTime()) && localDay(d) === value
}

export function parsePreset(value: string | null): Preset {
  return PRESETS.some((p) => p.value === value) ? (value as Preset) : 'month'
}

/** Today's local date, read when asked (not at import time), so a tab left open overnight stays right. */
export function today(): string {
  return localDay(new Date())
}
