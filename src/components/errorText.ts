import { ApiError } from '../api/client'

/**
 * Turns API failures into sentences a shop owner can act on. The API's own messages are
 * already written for people, but a few cases are not: framework validation errors
 * ("Input should be greater than or equal to 0"), bare HTTP errors ("Not Found") and
 * proxy pages with no body at all. Those are rewritten here; error codes never reach the screen.
 */

const LABELS: Record<string, string> = {
  name: 'Product name',
  selling_price: 'Selling price',
  purchase_price: 'Cost price',
  mrp_price: 'MRP',
  overhead_cost: 'Overhead cost',
  reorder_level: 'Reorder level',
  opening_quantity: 'Opening stock',
  product_code: 'Product code',
  barcode: 'Barcode',
  hsn_code: 'HSN / SAC code',
  gst_percent: 'GST %',
  profit_margin_percent: 'Profit margin',
  category_uuid: 'Category',
  unit_uuid: 'Unit',
  supplier_uuid: 'Supplier',
  phone: 'Phone number',
  email: 'Email',
  gstin: 'GSTIN',
  qty: 'Quantity',
  quantity: 'Quantity',
  delta: 'Quantity',
  unit_price: 'Price',
  amount: 'Amount',
  note: 'Note',
  reason: 'Reason',
}

/** `lines.0.unit_price` → "Price (line 1)"; unknown keys become "Some field". */
export function fieldLabel(field: string): string {
  const parts = field.split('.')
  const last = [...parts].reverse().find(p => !/^\d+$/.test(p)) ?? field
  const index = parts.find(p => /^\d+$/.test(p))
  const base = LABELS[last] ?? (last.replace(/_uuid$/, '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) || 'This field')
  return index === undefined ? base : `${base} (line ${Number(index) + 1})`
}

/** One validation message from the API, rewritten as a sentence about that field. */
export function describeField(field: string, message: string): string {
  const label = fieldLabel(field)
  let m: RegExpExecArray | null
  if (/^Field required$/i.test(message) || /at least 1 character/i.test(message)) return `${label} is required.`
  if ((m = /at most (\d+) characters?/i.exec(message))) return `${label} can be at most ${m[1]} characters long.`
  if ((m = /at least (\d+) characters?/i.exec(message))) return `${label} must be at least ${m[1]} characters long.`
  if (/greater than or equal to 0$/i.test(message)) return `${label} cannot be negative.`
  if ((m = /greater than or equal to ([\d.]+)/i.exec(message))) return `${label} must be ${m[1]} or more.`
  if ((m = /greater than ([\d.]+)/i.exec(message))) return `${label} must be more than ${m[1]}.`
  if ((m = /less than or equal to ([\d.]+)/i.exec(message))) return `${label} must be ${m[1]} or less.`
  if ((m = /less than ([\d.]+)/i.exec(message))) return `${label} must be less than ${m[1]}.`
  if ((m = /no more than (\d+) decimal places?/i.exec(message))) return `${label} can have at most ${m[1]} digits after the decimal point.`
  if (/no more than \d+ digits/i.test(message)) return `${label} is too large.`
  if (/valid (decimal|number|integer|float)/i.test(message)) return `${label} must be a number, like 25 or 25.5.`
  if (/valid email/i.test(message)) return 'Enter a valid email address.'
  if (/should match pattern/i.test(message)) return `${label} is not in the right format.`
  if (/extra inputs are not permitted/i.test(message)) return `${label} cannot be changed here.`
  if (/^Value error, /.test(message)) return message.replace(/^Value error, /, '')
  return `${label}: ${message}`
}

/** Friendly field messages keyed by the API field name (`selling_price`, …). */
export function fieldErrorsOf(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {}
  const out: Record<string, string> = {}
  for (const f of error.fields) out[f.field] ??= describeField(f.field, f.message)
  return out
}

const BY_STATUS: Record<number, string> = {
  400: 'Something in this request was not right. Check your details and try again.',
  401: 'Your session has ended. Please sign in again.',
  403: 'You do not have permission to do this.',
  404: 'We could not find what you were looking for. It may have been deleted.',
  405: 'This action is not available. Please refresh the page and try again.',
  408: 'The server took too long to answer. Please try again.',
  409: 'This was changed by someone else. Refresh the page and try again.',
  413: 'This file is too large to upload.',
  415: 'This file type is not supported.',
  429: 'Too many attempts. Please wait a moment and try again.',
  500: 'Something went wrong on our side. Please try again in a moment.',
  502: 'Storely is not reachable right now. Please try again in a moment.',
  503: 'Storely is busy or under maintenance. Please try again in a moment.',
  504: 'Storely took too long to answer. Please try again in a moment.',
}

// Messages that only restate the HTTP status (framework defaults, proxies, our own fallback).
const GENERIC = new Set(['', 'bad request', 'unauthorized', 'forbidden', 'not found', 'method not allowed', 'request timeout', 'conflict', 'payload too large', 'request entity too large', 'content too large', 'unsupported media type', 'too many requests', 'internal server error', 'bad gateway', 'service unavailable', 'gateway timeout', 'something went wrong.', 'something went wrong. please try again.'])

export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.'
  let text: string
  if (error.code === 'validation_error' || (error.status === 422 && error.fields.length)) {
    const fields = Object.values(fieldErrorsOf(error))
    text = fields.length ? fields.join(' ') : 'Some details are not valid. Check the form and try again.'
  } else if (error.code === 'csrf') {
    text = 'Please refresh the page and try again.'
  } else if ((error.code === 'internal_error' || /^http_\d+$/.test(error.code)) && GENERIC.has(error.message.trim().toLowerCase())) {
    // No real message (a framework or proxy error): say what it means in plain words.
    text = BY_STATUS[error.status] ?? (error.status >= 500 ? BY_STATUS[500] : undefined) ?? 'Something went wrong. Please try again.'
  } else {
    text = error.message
  }
  if (error.status === 429 && error.retryAfter) text = `${text} Try again in ${error.retryAfter} seconds.`
  if (error.requestId && (error.status >= 500 || error.status === 408 || error.code === 'internal_error')) {
    text = `${text} (Ref: ${error.requestId})`
  }
  return text
}
