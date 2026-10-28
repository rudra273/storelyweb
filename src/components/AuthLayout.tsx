import type { ReactNode } from 'react'

export function AuthLayout({ title, children, compact = false }: { title: string; children: ReactNode; compact?: boolean }) {
  return (
    <main className={compact ? 'auth' : 'auth auth-split'}>
      {!compact && <aside className="auth-story"><p className="brand"><span className="brand-mark" aria-hidden="true">S</span>Storely<span className="brand-dot">.</span></p><div><p className="eyebrow">YOUR SHOP. ALL TOGETHER.</p><h2>More clarity.<br />Every business day.</h2><p>Keep your products organised, your billing simple and your business in view.</p><ul><li>Know what’s in stock</li><li>Create bills with confidence</li><li>See how your shop is doing</li></ul></div><small>Inventory · Billing · Reports</small></aside>}
      <div className={compact ? undefined : 'auth-form-area'}><div className="auth-card">
        <p className="auth-form-brand">Storely</p>
        <h1>{title}</h1>
        {children}
      </div></div>
    </main>
  )
}
