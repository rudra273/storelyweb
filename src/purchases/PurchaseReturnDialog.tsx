import { useRef, useState, type FormEvent } from 'react'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../components/ui/toastContext'
import { Alert, Field } from '../components/ui/ui'
import { Button } from '../components/ui/workspace'
import { useAction } from '../components/useAction'
import { formatQty, paiseToDecimal, toPaise } from '../lib/money'
import type { Receipt } from './composer/contracts'
import { todayInShop } from './composer/draft'
import { receiptMoney } from './composer/money'
import { useCreatePurchaseReturn, type PurchaseReturnInput } from './queries'
import './purchases.css'

type RefundMethod = NonNullable<PurchaseReturnInput['refund_method']>
const METHODS: ReadonlyArray<readonly [RefundMethod, string]> = [
  ['cash', 'Cash'],
  ['upi', 'UPI'],
  ['card', 'Card'],
  ['bank_transfer', 'Bank transfer'],
  ['online', 'Online'],
]
const QTY_RE = /^\d{1,12}(\.\d{1,4})?$/
const MONEY_RE = /^\d{1,12}(\.\d{1,2})?$/

/** Parse a non-negative decimal string with up to 4 fractional digits into scaled BigInt (x 10,000). */
function toScaled4(text: string): bigint | null {
  const trimmed = text.trim()
  if (!QTY_RE.test(trimmed)) return null
  const [whole = '0', frac = ''] = trimmed.split('.')
  return BigInt(whole) * 10000n + BigInt(frac.padEnd(4, '0').slice(0, 4))
}

/** Exact half-up rounding of (qty4 * cost4) / 10^6 to paise (10^-2). */
function lineAmountPaise(qty4: bigint, cost4: bigint): bigint {
  const product = qty4 * cost4 // scaled by 10^8
  return (product + 500000n) / 1000000n // scaled by 10^2 (paise)
}

/**
 * Record a partial or full purchase return (debit note) against a posted purchase.
 * Stock decreases, weighted average cost adjusts, and payables/refunds settle on the server.
 */
export function PurchaseReturnDialog({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  const createReturn = useCreatePurchaseReturn(receipt.uuid)
  const toast = useToast()
  const { busy, error, run, setError } = useAction()
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(receipt.items.map(i => [i.uuid, ''])),
  )
  const [returnDate, setReturnDate] = useState(todayInShop())
  const [taxAmount, setTaxAmount] = useState('0.00')
  const [reason, setReason] = useState('')
  const [refundMethod, setRefundMethod] = useState<RefundMethod | ''>('')
  const [touched, setTouched] = useState(false)
  const requestKeyRef = useRef<string | null>(null)

  function resetKey() {
    requestKeyRef.current = null
  }

  const lines = receipt.items.map(item => {
    const raw = (quantities[item.uuid] ?? '').trim()
    const returned = item.returned_quantity ?? '0'
    const returnable = item.returnable_quantity ?? item.quantity
    const returnable4 = toScaled4(returnable) ?? 0n
    const cost4 = toScaled4(item.unit_cost) ?? 0n
    let qty4 = 0n
    let lineError: string | null = null
    if (raw !== '') {
      const parsed = toScaled4(raw)
      if (parsed === null) lineError = 'Enter a valid quantity (up to 4 decimal places).'
      else if (parsed > returnable4) lineError = `Cannot exceed returnable quantity (${formatQty(returnable)}).`
      else qty4 = parsed
    }
    const amountPaise = qty4 > 0n ? lineAmountPaise(qty4, cost4) : 0n
    return { item, raw, returned, returnable, returnable4, qty4, amountPaise, lineError }
  })

  const selectedLines = lines.filter(l => l.qty4 > 0n)
  const hasLineErrors = lines.some(l => l.lineError !== null)
  const taxTrimmed = taxAmount.trim()
  const taxBad = taxTrimmed !== '' && !MONEY_RE.test(taxTrimmed)
  const taxPaise = !taxBad && taxTrimmed !== '' ? (toPaise(taxTrimmed) ?? 0n) : 0n

  const subtotalPaise = selectedLines.reduce((sum, l) => sum + l.amountPaise, 0n)
  const totalPaise = subtotalPaise + taxPaise

  const notRecorded = receipt.payment_status === 'not_recorded'
  const balanceDuePaise = (() => {
    const p = toPaise(receipt.balance_due ?? '0')
    return p !== null && p > 0n ? p : 0n
  })()
  const payableCreditPaise = notRecorded ? 0n : (totalPaise < balanceDuePaise ? totalPaise : balanceDuePaise)
  const refundPaise = notRecorded ? 0n : totalPaise - payableCreditPaise
  const needsRefundMethod = refundPaise > 0n

  const reasonShort = reason.trim().length < 3
  const noItemsSelected = selectedLines.length === 0
  const missingRefundMethod = needsRefundMethod && refundMethod === ''

  async function submit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (busy) return
    if (noItemsSelected) { setError('Enter a return quantity for at least one item.'); return }
    if (hasLineErrors || taxBad || reasonShort || missingRefundMethod) return

    const requestKey = requestKeyRef.current ?? crypto.randomUUID()
    requestKeyRef.current = requestKey

    const payload: PurchaseReturnInput = {
      request_key: requestKey,
      return_date: returnDate,
      reason: reason.trim(),
      tax_amount: taxTrimmed === '' ? '0.00' : taxTrimmed,
      refund_method: needsRefundMethod ? (refundMethod as RefundMethod) : null,
      items: selectedLines.map(l => ({ purchase_item_uuid: l.item.uuid, quantity: l.raw })),
    }

    const done = await run(async () => {
      await createReturn.mutateAsync(payload)
      return true
    })
    if (done) {
      toast('Purchase return recorded')
      onClose()
    }
  }

  return <Modal title="Return items (Debit note)" onClose={onClose} canClose={!busy} wide>
    <form onSubmit={submit} noValidate aria-busy={busy}>
      <p>Select the quantities being returned to <strong>{receipt.supplier_name ?? 'the supplier'}</strong>. Returned stock is removed immediately.</p>
      <fieldset disabled={busy} className="pw-fieldset">
        <div className="table-wrap">
          <table className="table return-lines">
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Purchased</th>
                <th className="num">Already returned</th>
                <th className="num">Return qty</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ item, raw, returned, returnable, returnable4, amountPaise, lineError }) => (
                <tr key={item.uuid}>
                  <td>
                    {item.product_name}
                    <small className="stacked-note muted">{receiptMoney(item.unit_cost)} / {item.unit_name ?? 'unit'}</small>
                  </td>
                  <td className="num nowrap">{formatQty(item.quantity)} {item.unit_name}</td>
                  <td className="num nowrap">{formatQty(returned)} {item.unit_name}</td>
                  <td className="num">
                    <input
                      aria-label={`Return quantity for ${item.product_name}`}
                      inputMode="decimal"
                      placeholder={`Max ${formatQty(returnable)}`}
                      disabled={returnable4 <= 0n}
                      value={raw}
                      aria-invalid={lineError ? true : undefined}
                      onChange={e => {
                        resetKey()
                        setError(null)
                        setQuantities(prev => ({ ...prev, [item.uuid]: e.target.value }))
                      }}
                    />
                    {lineError && <small className="field-error stacked-note" role="alert">{lineError}</small>}
                  </td>
                  <td className="num nowrap">{receiptMoney(paiseToDecimal(amountPaise))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pw-fields return-meta">
          <Field
            label="Return date"
            type="date"
            min={receipt.purchase_date}
            max={todayInShop()}
            value={returnDate}
            required
            onChange={e => { resetKey(); setReturnDate(e.target.value) }}
          />
          <Field
            label="Tax adjustment (₹)"
            inputMode="decimal"
            value={taxAmount}
            aria-invalid={taxBad ? true : undefined}
            onChange={e => { resetKey(); setTaxAmount(e.target.value) }}
          />
          {needsRefundMethod && (
            <div className="field">
              <label htmlFor="return-refund-method" className="required-label">Refund method</label>
              <select
                id="return-refund-method"
                value={refundMethod}
                required
                aria-invalid={touched && missingRefundMethod ? true : undefined}
                onChange={e => { resetKey(); setRefundMethod(e.target.value as RefundMethod | '') }}
              >
                <option value="">Select refund method</option>
                {METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              {touched && missingRefundMethod && <small className="field-error" role="alert">Select how the supplier refunded the excess amount.</small>}
            </div>
          )}
        </div>
        {taxBad && <small className="field-error" role="alert">Enter a valid tax amount (up to 2 decimal places).</small>}

        <div className="field">
          <label htmlFor="return-reason" className="required-label">Reason for return</label>
          <textarea
            id="return-reason"
            rows={2}
            maxLength={300}
            value={reason}
            aria-invalid={touched && reasonShort ? true : undefined}
            onChange={e => { resetKey(); setReason(e.target.value) }}
          />
          {touched && reasonShort && <small className="field-error" role="alert">Give a reason of at least 3 characters. It stays on the debit note.</small>}
        </div>
      </fieldset>

      <section className="card pw-review" aria-live="polite" aria-label="Return summary">
        <dl className="pw-totals">
          <dt>Items subtotal</dt><dd>{receiptMoney(paiseToDecimal(subtotalPaise))}</dd>
          {taxPaise > 0n && <><dt>Tax adjustment</dt><dd>{receiptMoney(paiseToDecimal(taxPaise))}</dd></>}
          <dt className="pw-grand">Return total</dt><dd className="pw-grand"><strong>{receiptMoney(paiseToDecimal(totalPaise))}</strong></dd>
          <dt>Payable credit</dt><dd>{receiptMoney(paiseToDecimal(payableCreditPaise))}</dd>
          {refundPaise > 0n && <><dt>Supplier refund</dt><dd><strong>{receiptMoney(paiseToDecimal(refundPaise))}</strong></dd></>}
        </dl>
        {notRecorded && (
          <p className="muted pw-note">Payment terms were not recorded for this purchase, so this return adjusts stock cost only with ₹0.00 payable credit.</p>
        )}
      </section>

      {error && <Alert>{error}</Alert>}
      <div className="actions">
        <Button disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Recording…' : 'Record return'}</Button>
      </div>
    </form>
  </Modal>
}
