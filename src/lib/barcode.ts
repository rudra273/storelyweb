import JsBarcode from 'jsbarcode'

export const BARCODE_OPTIONS = { format: 'CODE128', width: 1.6, height: 38, fontSize: 11, margin: 0, displayValue: true }

/** Whether Code 128 can hold this text. The library reports it through `valid`; the text
 * itself is switched off here so the check needs no canvas. */
export function canEncode(value: string): boolean {
  let valid = false
  try {
    JsBarcode(document.createElementNS('http://www.w3.org/2000/svg', 'svg'), value, {
      ...BARCODE_OPTIONS,
      displayValue: false,
      valid: (ok: boolean) => {
        valid = ok
      },
    })
  } catch {
    return false
  }
  return valid
}
