import { useEffect, useRef, type ReactNode } from 'react'

/** A dialog built on the browser's own <dialog>: focus stays inside, Esc closes it. */
export function Modal({ title, onClose, children, wide = false, canClose = true }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; canClose?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    // Opening a native dialog otherwise focuses its header's Close button,
    // overriding React's autofocus on form fields while the dialog was hidden.
    dialog.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])')?.focus({ preventScroll: true })
  }, [])
  return (
    <dialog ref={ref} className={wide ? 'modal wide' : 'modal'} aria-label={title} onClose={onClose} onCancel={e => { if (canClose) onClose(); else e.preventDefault() }}>
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
