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

test('browser checks are worded like the rest of the app', async () => {
  const { validityText } = await import('./validity')
  const input = (attrs: Record<string, string>, value: string) => {
    const el = document.createElement('input')
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    el.value = value
    return el
  }
  expect(validityText(input({ required: '' }, ''), 'Amount (₹)')).toBe('Amount is required.')
  expect(validityText(input({ type: 'number', min: '0.01' }, '0'), 'Amount (₹)')).toBe('Amount must be 0.01 or more.')
  expect(validityText(input({ type: 'number', min: '0' }, '-1'), 'Quantity')).toBe('Quantity cannot be negative.')
  expect(validityText(input({ type: 'number', step: '0.01' }, '1.234'), 'Price')).toBe('Price can have at most 2 digits after the decimal point.')
  expect(validityText(input({ type: 'email' }, 'nope'), 'Email')).toBe('Enter an email like name@example.com.')
})
