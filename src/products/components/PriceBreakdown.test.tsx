import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import type { PricePreview } from '../queries'
import { PriceBreakdown } from './PriceBreakdown'

for (const registered of [false, true]) {
  test(`effective tax presentation follows server calculation, charge GST: ${registered}`, () => {
    const response: PricePreview = { price_mode: 'formula', selling_price: registered ? '1338.93' : '1336.91', pre_gst_selling_price: registered ? '1134.6845' : '1336.9055', output_gst_amount: registered ? '204.24321' : '0', purchase_price: '1000', purchase_gst_amount: registered ? '0' : '180', overhead_cost: '10', total_cost: registered ? '1010' : '1190', cost_known: true, profit_margin_percent: '12.345', profit_amount: registered ? '124.6845' : '146.9055', gst_percent: '18', gst_source: 'shop', category_name: null, gst_registered: registered }
    render(<PriceBreakdown preview={response} pending={false} error={null} />)
    expect(screen.getByText('Sells at').closest('div')).toHaveTextContent(registered ? '₹1,338.93' : '₹1,336.91')
    expect(screen.getByText(registered ? 'GST is charged on invoices. The pricing calculation excludes purchase GST from cost.' : 'GST is not charged on invoices. The pricing calculation includes purchase GST in cost.')).toBeInTheDocument()
    expect(screen.queryByText(/Your shop is not GST-registered/)).not.toBeInTheDocument()
    expect(screen.getByText('+ Margin 12.345%')).toBeInTheDocument()
  })
}
