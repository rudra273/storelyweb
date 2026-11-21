import { expect, test } from 'vitest'
import { ApiError } from '../api/client'
import { describeError, fieldErrorsOf } from './errorText'

test('validation errors become sentences about the field, never codes', () => {
  const error = new ApiError(422, 'validation_error', 'The request is not valid.', null, [
    { field: 'selling_price', message: 'Input should be greater than or equal to 0' },
    { field: 'name', message: 'String should have at least 1 character' },
  ])
  expect(describeError(error)).toBe('Selling price cannot be negative. Product name is required.')
  expect(fieldErrorsOf(error)).toEqual({ selling_price: 'Selling price cannot be negative.', name: 'Product name is required.' })
})

test('bare HTTP and server errors get a plain explanation', () => {
  expect(describeError(new ApiError(404, 'http_404', 'Not Found'))).toMatch(/could not find/)
  expect(describeError(new ApiError(502, 'http_502', 'Something went wrong. Please try again.'))).toMatch(/not reachable/)
  expect(describeError(new ApiError(500, 'internal_error', 'Something went wrong.'))).toMatch(/on our side/)
})

test('the API’s own messages pass through unchanged', () => {
  expect(describeError(new ApiError(409, 'duplicate_invoice', 'This supplier invoice is already recorded.'))).toBe('This supplier invoice is already recorded.')
})

test('server and timeout failures include the support request id when available', () => {
  const err = new ApiError(500, 'internal_error', 'Something went wrong.', null, [], 'req-1234')
  expect(describeError(err)).toContain('(Ref: req-1234)')

  const timeout = new ApiError(408, 'timeout', 'The server took too long to answer. Please try again.', null, [], 'req-5678')
  expect(describeError(timeout)).toContain('(Ref: req-5678)')
})
