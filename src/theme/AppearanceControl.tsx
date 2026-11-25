import { useId } from 'react'
import { useTheme } from './context'
import { THEME_LABELS, type ThemePreference } from './theme'

/** The one place to choose Light, Dark or System. `tone="inverse"` is for the dark sidebar. */
export function AppearanceControl({ tone = 'default' }: { tone?: 'default' | 'inverse' }) {
  const { preference, setPreference, error, pending, disabled, retry } = useTheme()
  const id = useId()
  return <div className={tone === 'inverse' ? 'appearance appearance-inverse' : 'appearance'}>
    <label htmlFor={id}>Appearance</label>
    <select id={id} disabled={disabled} value={preference} onChange={e => setPreference(e.target.value as ThemePreference)}>
      {(Object.keys(THEME_LABELS) as ThemePreference[]).map(p => <option key={p} value={p}>{THEME_LABELS[p]}</option>)}
    </select>
    {pending && <small className="muted" role="status">{pending === 'saving' ? 'Saving appearance…' : 'Loading appearance…'}</small>}
    {error && <small role="alert">{error} <button type="button" className="link" onClick={retry}>Retry appearance</button></small>}
  </div>
}
