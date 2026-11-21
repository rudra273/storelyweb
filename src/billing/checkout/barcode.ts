function hasControlCharacter(raw: string): boolean {
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

/** Only a bounded package/code token may prefill a new catalogue barcode.
 * Internal IDs and application/URL payloads remain lookup inputs, never new barcodes. */
export function barcodeForCreation(raw: string): string | null {
  if (hasControlCharacter(raw)) return null
  const code = raw.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(code)) return null
  if (/^[a-f0-9]{32}$/i.test(code) || /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(code)) return null
  return code
}
