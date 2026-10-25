import { useEffect, useRef, type ReactNode } from 'react'

/** A dialog built on the browser's own <dialog>: focus stays inside, Esc closes it. */
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
  }, [])
  return (
    <dialog ref={ref} className={wide ? 'modal wide' : 'modal'} aria-label={title} onClose={onClose} onCancel={onClose}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="link" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      {children}
    </dialog>
  )
}
