import './workspace.css'
import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { validityText } from './validity'

export function Field({
  label,
  hint,
  error,
  ...input
}: { label: string; hint?: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const [browserError, setValidationError] = useState('')
  const validationError = error || browserError
  const isPassword = input.type === 'password'
  return (
    <div className="field">
      <label htmlFor={id} className={input.required ? "required-label" : undefined}>{label}</label>
      <div className={isPassword ? 'password-input' : undefined}>
        <input id={id} {...input} aria-invalid={validationError ? true : input['aria-invalid']} aria-describedby={[hint ? `${id}-hint` : '', validationError ? `${id}-error` : '', input['aria-describedby'] ?? ''].filter(Boolean).join(' ') || undefined} onInvalid={e => { e.preventDefault(); setValidationError(validityText(e.currentTarget, label)); input.onInvalid?.(e) }} onInput={e => { if (browserError) setValidationError(''); input.onInput?.(e) }} type={isPassword && visible ? 'text' : input.type} />
        {isPassword && <button type="button" className="password-toggle" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-controls={id} aria-pressed={visible} disabled={input.disabled} onClick={() => setVisible(!visible)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible && <path d="m3 3 18 18" />}</svg>
        </button>}
      </div>
      {validationError && <small id={`${id}-error`} className="field-error" role={error ? undefined : 'alert'}>{validationError}</small>}
      {hint && (
        <small id={`${id}-hint`} className="hint">
          {hint}
        </small>
      )}
    </div>
  )
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'info' | 'success'; children: ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="loading" role="status">
      {label}
    </p>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  )
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="card">
      {title && <h2>{title}</h2>}
      {children}
    </section>
  )
}
