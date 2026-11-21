import { afterEach, expect, test, vi } from 'vitest'
import { CUSTOM_ID, DEFAULT_PRESET, PRESETS, labelsPerPage, layoutOf, layoutProblem, loadSaved, pageRule, paginate, save, type Layout } from './layout'

afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

const sheet = PRESETS.find(p => p.id === 'a4-24')!.layout
const roll = PRESETS.find(p => p.id === 'roll-50x25')!.layout

test('every preset fits the paper it is for', () => {
  for (const p of PRESETS) expect(layoutProblem(p.layout), p.id).toBeNull()
  expect(labelsPerPage(sheet)).toBe(24)
  expect(labelsPerPage(roll)).toBe(1)
})

test('a layout that runs off the sheet is explained in millimetres', () => {
  expect(layoutProblem({ ...sheet, cols: 4 })).toMatch(/4 labels across need 280\.0 mm, but an A4 sheet is 210 mm wide/)
  expect(layoutProblem({ ...sheet, rows: 9 })).toMatch(/9 rows down need 333\.0 mm/)
  expect(layoutProblem({ ...sheet, width: 5 })).toMatch(/width must be between/)
  expect(layoutProblem({ ...sheet, cols: 2.5 })).toMatch(/whole numbers/)
  expect(layoutProblem({ ...sheet, left: -1 })).toMatch(/Margins and gaps/)
})

test('a sheet fills row by row and starts a new page when full', () => {
  const labels = Array.from({ length: 30 }, (_, i) => i + 1)
  const pages = paginate(labels, sheet)
  expect(pages.map(p => p.length)).toEqual([24, 6])
  expect(pages[0]![0]).toBe(1)
})

test('a part-used sheet starts at the chosen slot and leaves the used ones empty', () => {
  const pages = paginate([1, 2, 3], sheet, 22)
  expect(pages).toHaveLength(1)
  expect(pages[0]!.slice(20)).toEqual([null, 1, 2, 3].slice(0, 4))
  expect(pages[0]!.filter(x => x === null)).toHaveLength(21)
  // Labels that no longer fit spill onto the next sheet, from its first slot.
  const spill = paginate([1, 2, 3, 4, 5], sheet, 23)
  expect(spill[0]!.filter(x => x !== null)).toEqual([1, 2])
  expect(spill[1]).toEqual([3, 4, 5])
  // Nonsense start slots are kept inside the sheet.
  expect(paginate([1], sheet, 0)[0]![0]).toBe(1)
  expect(paginate([1], sheet, 99)[0]!.indexOf(1)).toBe(23)
})

test('a layout still being typed has no pages instead of crashing', () => {
  expect(paginate([1, 2], { ...sheet, cols: NaN })).toEqual([])
  expect(paginate([1, 2], { ...sheet, rows: 0 })).toEqual([])
})

test('a roll prints one label per page, whatever the start slot', () => {
  expect(paginate([1, 2, 3], roll, 5)).toEqual([[1], [2], [3]])
})

test('the page rule is the real paper size with no margin of its own', () => {
  expect(pageRule(sheet)).toBe('@page { size: A4 portrait; margin: 0; }')
  expect(pageRule(roll)).toBe('@page { size: 50mm 25mm; margin: 0; }')
})

test('the choice is remembered per shop, and blocked or damaged storage means defaults', () => {
  const custom: Layout = { ...sheet, width: 60, cols: 3 }
  save('s1', { preset: CUSTOM_ID, custom, options: { price: false, shop: true } })
  expect(loadSaved('s1')).toEqual({ preset: CUSTOM_ID, custom, options: { price: false, shop: true } })
  expect(loadSaved('s2').preset).toBe(DEFAULT_PRESET.id)
  localStorage.setItem('storely.labels.v1:s3', '{not json')
  expect(loadSaved('s3').preset).toBe(DEFAULT_PRESET.id)
  localStorage.setItem('storely.labels.v1:s4', JSON.stringify({ preset: 'gone', custom: { ...sheet, cols: 99 } }))
  const s4 = loadSaved('s4')
  expect(s4.preset).toBe(DEFAULT_PRESET.id)
  expect(layoutProblem(s4.custom)).toBeNull()
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  expect(loadSaved('s1').preset).toBe(DEFAULT_PRESET.id)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  expect(() => save('s1', loadSaved('s1'))).not.toThrow()
})

test('a layout comes from the chosen preset, or the custom one', () => {
  expect(layoutOf('roll-38x25', sheet).width).toBe(38)
  expect(layoutOf(CUSTOM_ID, { ...sheet, width: 61 }).width).toBe(61)
  expect(layoutOf('unknown', sheet)).toEqual(DEFAULT_PRESET.layout)
})
