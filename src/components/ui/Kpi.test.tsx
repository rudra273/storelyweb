import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { ApiError } from '../../api/client'
import { Kpi, Sparkline } from './Kpi'
import { ErrorState, KpiSkeletons, OfflineBanner } from './states'

test('a figure that is not available reads as unavailable, never as zero', () => {
  render(<Kpi label="Gross profit" value={null} />)
  expect(screen.getByText('Not available')).toBeInTheDocument()
  expect(screen.queryByText('₹0.00')).not.toBeInTheDocument()
})

test('a real zero is shown as a zero', () => {
  render(<Kpi label="Expenses" value="₹0.00" />)
  expect(screen.getByText('₹0.00')).toBeInTheDocument()
  expect(screen.queryByText('Not available')).not.toBeInTheDocument()
})

test('comparison says what changed in words and arrows, or that there is nothing to compare', () => {
  const { rerender } = render(<Kpi label="Sales" value="₹100.00" comparison={{ text: '₹20.00 (25%) more than last month', direction: 'up' }} />)
  expect(screen.getByText(/₹20.00 \(25%\) more than last month/)).toHaveTextContent('▲')
  rerender(<Kpi label="Sales" value="₹100.00" comparison={null} />)
  expect(screen.getByText('No comparison')).toBeInTheDocument()
  rerender(<Kpi label="Sales" value="₹100.00" />)
  expect(screen.queryByText('No comparison')).not.toBeInTheDocument()
})

test('the sparkline is described in words and its exact values are one click away', async () => {
  const points = [{ label: '2026-11-01', value: 100 }, { label: '2026-11-02', value: 250 }]
  render(<Sparkline title="Sales by day" points={points} />)
  expect(screen.getByRole('img')).toHaveAccessibleName('Sales by day: from ₹100.00 on 2026-11-01 to ₹250.00 on 2026-11-02')
  await userEvent.click(screen.getByText('Show values'))
  const row = screen.getByRole('row', { name: /2026-11-02/ })
  expect(within(row).getByText('₹250.00')).toBeInTheDocument()
})

test('a trend of one day draws no line', () => {
  render(<Kpi label="Sales" value="₹100.00" trend={[{ label: 'today', value: 100 }]} />)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

test('loading placeholders are announced and show no figures', () => {
  render(<KpiSkeletons count={4} />)
  const region = screen.getByRole('status', { name: 'Loading figures…' })
  expect(region).toHaveAttribute('aria-busy', 'true')
  expect(region).toHaveTextContent('')
})

test('an error says what happened and offers a retry', async () => {
  let tried = 0
  render(<ErrorState error={new ApiError(503, 'unavailable', 'The server is busy.')} onRetry={() => { tried += 1 }} />)
  expect(screen.getByRole('alert')).toHaveTextContent('The server is busy.')
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(tried).toBe(1)
})

test('the offline banner appears when the connection drops and goes when it returns', () => {
  render(<OfflineBanner />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  act(() => { window.dispatchEvent(new Event('offline')) })
  expect(screen.getByRole('status')).toHaveTextContent('You are offline')
  act(() => { window.dispatchEvent(new Event('online')) })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
