import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { Field } from './ui'

test('password visibility toggles without changing the value or submitting', async () => {
  render(<form><Field label="Password" type="password" defaultValue="eight123" /></form>)
  const input = screen.getByLabelText('Password')
  expect(input).toHaveAttribute('type', 'password')
  const show = screen.getByRole('button', { name: 'Show password' })
  expect(show).toHaveAttribute('type', 'button')
  await userEvent.click(show)
  expect(input).toHaveAttribute('type', 'text')
  expect(input).toHaveValue('eight123')
  expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'Hide password' }))
  expect(input).toHaveAttribute('type', 'password')
})

test('disabled passwords cannot be revealed and ordinary fields have no toggle', () => {
  render(<><Field label="Your password" type="password" disabled /><Field label="Name" /></>)
  expect(screen.getByRole('button', { name: 'Show your password' })).toBeDisabled()
  expect(screen.getAllByRole('button')).toHaveLength(1)
})
