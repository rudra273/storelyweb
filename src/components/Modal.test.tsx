import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Modal } from './Modal'

function Example() {
  const [open, setOpen] = useState(false)
  return <><button onClick={() => setOpen(true)}>Open editor</button>{open && <Modal title="Editor" onClose={() => setOpen(false)}><label>Name<input /></label></Modal>}</>
}

test('unmounting a dialog restores focus to the control that opened it', async () => {
  render(<Example />)
  const opener = screen.getByRole('button', { name: 'Open editor' })
  await userEvent.click(opener)
  expect(screen.getByLabelText('Name')).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(opener).toHaveFocus()
})


test('queued close events after reopening and child-dialog events do not close the parent', () => {
  const parentClose = vi.fn(), childClose = vi.fn()
  render(<Modal title="Parent" onClose={parentClose}><Modal title="Child" onClose={childClose}>Child content</Modal></Modal>)
  const parent = screen.getByRole('dialog', { name: 'Parent' })
  const child = screen.getByRole('dialog', { name: 'Child' })
  fireEvent(parent, new Event('close', { bubbles: false }))
  expect(parentClose).not.toHaveBeenCalled()
  child.removeAttribute('open')
  fireEvent(child, new Event('close', { bubbles: false }))
  expect(childClose).toHaveBeenCalledTimes(1)
  expect(parentClose).not.toHaveBeenCalled()
})
