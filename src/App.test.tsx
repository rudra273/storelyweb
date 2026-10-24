import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

test('renders the Storely heading', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Storely' })).toBeInTheDocument()
})
