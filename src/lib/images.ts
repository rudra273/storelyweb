/** Shop logo and signature pictures, stored as plain base64 exactly as the phone stores them
 * (the phone takes pictures up to 400 KB and draws them on its PDF invoices). */

export const MAX_IMAGE_BYTES = 400 * 1024
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/** A data: URL for a stored picture, its type read from the first bytes. */
export function imageSrc(base64: string | null | undefined): string | null {
  if (!base64) return null
  const type = base64.startsWith('/9j/') ? 'jpeg' : base64.startsWith('R0lGOD') ? 'gif' : base64.startsWith('UklGR') ? 'webp' : 'png'
  return `data:image/${type};base64,${base64}`
}

function readAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(new Error('read'))
    reader.readAsDataURL(blob)
  })
}

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')) }
    img.src = url
  })
}

/** A picture ready to save: small files are kept as they are; a large one is shrunk to fit
 * `maxWidth` × `maxHeight` (as PNG, keeping transparency, or JPEG if that is still too big). */
export async function prepareImage(file: File, maxWidth: number, maxHeight: number): Promise<string> {
  if (!TYPES.includes(file.type)) throw new Error('Choose a PNG, JPG, WebP or GIF picture.')
  if (file.size <= MAX_IMAGE_BYTES && file.type !== 'image/webp') return readAsBase64(file)
  let img: HTMLImageElement
  try { img = await load(file) } catch { throw new Error('This picture could not be opened. Try another file.') }
  const scale = Math.min(1, maxWidth / img.naturalWidth, maxHeight / img.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser could not resize the picture. Choose one under 400 KB.')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const encode = (type: string, quality?: number) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality))
  let blob = await encode('image/png')
  if (!blob || blob.size > MAX_IMAGE_BYTES) {
    // JPEG has no transparency: paint white behind the picture first.
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    blob = await encode('image/jpeg', 0.85)
  }
  if (!blob || blob.size > MAX_IMAGE_BYTES) throw new Error('This picture is too large even after shrinking. Choose a smaller one.')
  return readAsBase64(blob)
}
