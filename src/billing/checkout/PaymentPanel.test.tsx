import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { PaymentPanel } from './PaymentPanel'

test('counter cash change preserves exact paise beyond binary number precision', () => {
  render(<PaymentPanel total="0.01" value={{ paid: 'full', method: 'cash', amount: '', reference: '', cash: '9007199254740993.02' }} onChange={() => {}} error="" disabled={false} />)
  expect(screen.getByText(/Change to return/)).toHaveTextContent('Change to return ₹9,00,71,99,25,47,40,993.01')
})
