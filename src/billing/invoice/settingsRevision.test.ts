import { afterEach, expect, test, vi } from 'vitest'
import type { InvoiceSettings } from '../queries'
import { fakeApi, ok } from '../../test-utils'
import { assertSettingsRevisionSupport, rebaseSettings, requireSettingsRevision, settingsChanges, settingsReview } from './settingsRevision'

afterEach(() => vi.unstubAllGlobals())
const base = { revision: 's1:900719925474099312345', shop_name: 'Shop', footer_text: 'Old footer', shop_phone: '1111111111', show: { show_hsn_column: true, show_item_name_column: true } } as unknown as InvoiceSettings
const capability = { contract_version: 1, shop_id: 's1', role: 'owner', features: { settings_revision: 1 } }

test('settings token remains an opaque string and is not part of the editable patch', () => {
  expect(requireSettingsRevision(base)).toBe('s1:900719925474099312345')
  expect(settingsChanges(base, { ...base, footer_text: ' New footer ' })).toEqual({ footer_text: 'New footer' })
})

test('explicit rebase merges only locally changed settings and individual visibility keys', () => {
  const mine = { ...base, footer_text: 'My footer', show: { ...base.show, show_hsn_column: false } }
  const latest = { ...base, revision: 's1:900719925474099312346', footer_text: 'Other footer', shop_phone: '2222222222', show: { ...base.show, show_item_name_column: false } }
  const merged = rebaseSettings(base, mine, latest)
  expect(merged).toMatchObject({ revision: latest.revision, footer_text: 'My footer', shop_phone: latest.shop_phone, show: { show_hsn_column: false, show_item_name_column: false } })
  expect(settingsChanges(latest, merged)).toEqual({ footer_text: 'My footer', show: { show_hsn_column: false } })
  expect((latest as InvoiceSettings).show.show_hsn_column).toBe(true)
})

test('image reviews describe presence without exposing stored image data', () => {
  const rows = settingsReview(base, { ...base, shop_logo: 'private-image-data' }, { ...base, shop_logo: 'other-image-data' })
  expect(rows).toEqual([{ label: 'Shop logo', current: 'Image set', mine: 'Image set' }])
  expect(JSON.stringify(rows)).not.toContain('image-data')
})

test('known settings capability is accepted', async () => {
  fakeApi([ok('GET', '/v1/shops/s1/capabilities', capability)])
  await expect(assertSettingsRevisionSupport('s1')).resolves.toBeUndefined()
})

for (const value of [{ ...capability, contract_version: 2 }, { ...capability, shop_id: 'other' }, { ...capability, features: {} }, { ...capability, features: { settings_revision: 2 } }]) {
  test(`unsupported settings contract stays fail-closed: ${JSON.stringify(value)}`, async () => {
    fakeApi([ok('GET', '/v1/shops/s1/capabilities', value)])
    await expect(assertSettingsRevisionSupport('s1')).rejects.toMatchObject({ code: 'unsupported_settings_contract' })
  })
}

test('missing legacy settings capability does not permit an unguarded write', async () => {
  fakeApi([ok('GET', '/v1/shops/s1/capabilities', { error: { code: 'http_404', message: 'Not Found' } }, 404)])
  await expect(assertSettingsRevisionSupport('s1')).rejects.toMatchObject({ code: 'unsupported_settings_contract' })
})

for (const revision of [undefined, 1, 's2:1', 's1:bad', 's1:' + '1'.repeat(31)]) {
  test(`malformed settings revision fails closed: ${String(revision)}`, () => {
    expect(() => requireSettingsRevision({ ...base, revision } as unknown as InvoiceSettings)).toThrow(/cannot confirm safe settings editing/)
  })
}
