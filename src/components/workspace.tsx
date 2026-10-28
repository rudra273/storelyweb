import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import './workspace.css'

export function Button({ variant = 'secondary', className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return <button {...props} type={type} className={`ui-button ${variant === 'secondary' ? '' : variant === 'danger' ? 'danger-button' : 'primary'} ${className}`} />
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-head"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{actions && <div className="actions ui-page-actions">{actions}</div>}</header>
}

export function Toolbar({ label, children, className = '', onChange }: { label: string; children: ReactNode; className?: string; onChange?: () => void }) {
  return <div className={`filters ui-toolbar ${className}`} role="search" aria-label={label} onChange={onChange}>{children}</div>
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <fieldset className="ui-form-section"><legend>{title}</legend>{description && <p className="muted">{description}</p>}<div className="form-grid">{children}</div></fieldset>
}

/** Native disclosure keeps ordinary buttons reachable with Tab; Escape returns to its trigger. */
export function ActionMenu({ label = 'More actions', children }: { label?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) ref.current?.removeAttribute('open')
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [])
  return <details className="ui-action-menu" ref={ref} onKeyDown={e => {
    if (e.key === 'Escape') { e.preventDefault(); ref.current?.removeAttribute('open'); ref.current?.querySelector('summary')?.focus() }
  }}>
    <summary>{label} <span aria-hidden="true">⌄</span></summary>
    <div className="ui-action-menu-panel" onClick={e => {
      const button = (e.target as HTMLElement).closest('button')
      if (button && !button.disabled) { ref.current?.removeAttribute('open'); ref.current?.querySelector('summary')?.focus() }
    }}>{children}</div>
  </details>
}
