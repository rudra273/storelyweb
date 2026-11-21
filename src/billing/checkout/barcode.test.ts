import { expect, test } from 'vitest'
import { barcodeForCreation } from './barcode'

for (const code of ['0', 'SKU-001.A_2', 'A'.repeat(64)]) {
  test(`bounded ASCII barcode ${code} can prefill creation`, () => expect(barcodeForCreation(` ${code} `)).toBe(code))
}
for (const code of ['', 'A'.repeat(65), 'a b', 'https://storely.app/item', 'storely:product:one', '{"type":"product"}', '[123]', '123456781234123412341234567890ab', '12345678-1234-1234-1234-1234567890ab', 'ABC\n', '\tABC', 'ABC\u007f', 'चावल']) {
  test(`non-barcode payload ${JSON.stringify(code)} is never a creation prefill`, () => expect(barcodeForCreation(code)).toBeNull())
}
