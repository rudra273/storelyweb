import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ToastContext } from './toastContext'

/** One short confirmation at a time ("Product saved"), announced politely and gone after
 * a few seconds. Errors stay as alerts beside what failed; this is only for success. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null)
  const show = useCallback((text: string) => setMessage({ text, id: Date.now() }), [])
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 3500)
    return () => clearTimeout(timer)
  }, [message])
  return <ToastContext.Provider value={show}>
    {children}
    <div className="toast-region" aria-live="polite">
      {message && <div className="toast" key={message.id}><span aria-hidden="true">✓</span> {message.text}</div>}
    </div>
  </ToastContext.Provider>
}
