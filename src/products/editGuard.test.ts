import { afterEach, expect, test, vi } from 'vitest'
import { fakeApi, ok } from '../test-utils'
import { assertProductEditSupport, rebaseEditedFields } from './editGuard'

afterEach(() => vi.unstubAllGlobals())
const path = '/v1/shops/s1/capabilities'
const capability = { contract_version: 1, shop_id: 's1', role: 'owner', features: { operation_lookup: 1, supplier_payment_proof: 1, supplier_payment_binding: 2, product_expected_updated_at: 1 } }

test('known capability supports guarded editing while missing routes and tenant errors fail closed', async () => {
  fakeApi([ok('GET', path, capability)])
  await expect(assertProductEditSupport('s1')).resolves.toBeUndefined()
  fakeApi([ok('GET', path, { error: { code: 'http_404', message: 'Not Found' } }, 404)])
  await expect(assertProductEditSupport('s1')).rejects.toMatchObject({ code: 'unsupported_edit_contract' })
  fakeApi([ok('GET', path, { error: { code: 'not_found', message: 'No such shop.' } }, 404)])
  await expect(assertProductEditSupport('s1')).rejects.toMatchObject({ code: 'not_found' })
})

for (const value of [{ ...capability, contract_version: 2 }, { ...capability, shop_id: 'other' }, { ...capability, features: {} }, { ...capability, features: { ...capability.features, product_expected_updated_at: 0 } }]) {
  test(`unsafe capability is refused: ${JSON.stringify(value)}`, async () => {
    fakeApi([ok('GET', path, value)])
    await expect(assertProductEditSupport('s1')).rejects.toMatchObject({ code: 'unsupported_edit_contract' })
  })
}

test('explicit rebase keeps only local edits and retains unrelated changes from the latest product', () => {
  expect(rebaseEditedFields({ name: 'Rice', price: '25', reorder: '10' }, { name: 'Rice', price: '25', reorder: '20' }, { name: 'New Rice', price: '30', reorder: '15' })).toEqual({ name: 'New Rice', price: '30', reorder: '20' })
})
