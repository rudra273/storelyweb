import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
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
