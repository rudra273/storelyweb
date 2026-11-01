import { useEffect, useRef, type ReactNode } from 'react'

/** A dialog built on the browser's own <dialog>: focus stays inside, Esc closes it. */
export function Modal({ title, onClose, children, wide = false, canClose = true }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; canClose?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  useEffect(() => {
    const dialog = ref.current
    const restoreTarget = opener.current
    if (!dialog || dialog.open) return
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    // Opening a native dialog otherwise focuses its header's Close button,
    // overriding React's autofocus on form fields while the dialog was hidden.
    dialog.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])')?.focus({ preventScroll: true })
    return () => {
      // Removing an open dialog skips the browser's usual focus restoration.
      if (dialog.open && typeof dialog.close === 'function') dialog.close()
      if (restoreTarget?.isConnected) restoreTarget.focus({ preventScroll: true })
    }
  }, [])
  return (
    <dialog ref={ref} className={wide ? 'modal wide' : 'modal'} aria-label={title} onClose={e => {
      // StrictMode closes and reopens the native dialog during effect replay.
      // Ignore that queued close event, and close events from nested dialogs.
      if (e.target === e.currentTarget && !e.currentTarget.open) onClose()
    }} onCancel={e => {
      if (e.target !== e.currentTarget) return
      e.preventDefault()
      if (canClose) onClose()
    }}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="link" onClick={onClose} aria-label="Close" disabled={!canClose}>
          ✕
        </button>
      </div>
      {children}
    </dialog>
  )
}
