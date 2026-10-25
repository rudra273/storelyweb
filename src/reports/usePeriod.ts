import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { isDay, parsePreset, rangeFor, type Preset } from './periods'

export interface Period {
  preset: Preset
  from: string
  to: string
  /** True when custom dates were typed but are not a usable range yet. */
  invalid: boolean
  set: (preset: Preset, from?: string, to?: string) => void
}

/** The chosen period lives in the address, so a report can be bookmarked or shared. */
export function usePeriod(): Period {
  const [params, setParams] = useSearchParams()
  const preset = parsePreset(params.get('p'))
  return useMemo(() => {
    const fixed = rangeFor(preset)
    const typedFrom = params.get('from')
    const typedTo = params.get('to')
    const fallback = rangeFor('month')!
    const from = fixed?.from ?? (isDay(typedFrom) ? typedFrom : fallback.from)
    const to = fixed?.to ?? (isDay(typedTo) ? typedTo : fallback.to)
    const invalid = preset === 'custom' && (!isDay(typedFrom) || !isDay(typedTo) || from > to)
    return {
      preset,
      from,
      to,
      invalid,
      set: (next, f, t) => {
        const q = new URLSearchParams(params)
        q.set('p', next)
        if (next === 'custom') {
          q.set('from', f ?? from)
          q.set('to', t ?? to)
        } else {
          q.delete('from')
          q.delete('to')
        }
        setParams(q, { replace: true })
      },
    }
  }, [preset, params, setParams])
}
