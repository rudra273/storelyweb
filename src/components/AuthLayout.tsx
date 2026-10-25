import type { ReactNode } from 'react'

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="auth">
      <div className="auth-card">
        <p className="brand">Storely</p>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  )
}
