import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AppearanceControl } from './AppearanceControl'
import { ThemeProvider } from './ThemeProvider'
import { THEME_KEY, readPreference, resolveTheme } from './theme'

type Listener = () => void
function stubSystem(dark: boolean) {
  const listeners = new Set<Listener>()
  const media = { matches: dark, addEventListener: (_: string, l: Listener) => listeners.add(l), removeEventListener: (_: string, l: Listener) => listeners.delete(l) }
  vi.stubGlobal('matchMedia', () => media)
  return (next: boolean) => { media.matches = next; listeners.forEach(l => l()) }
}

beforeEach(() => document.documentElement.removeAttribute('data-theme'))
afterEach(() => vi.unstubAllGlobals())

test('System follows the operating system, an explicit choice does not', () => {
  expect(resolveTheme('system', true)).toBe('dark')
  expect(resolveTheme('system', false)).toBe('light')
  expect(resolveTheme('light', true)).toBe('light')
  expect(resolveTheme('dark', false)).toBe('dark')
})

test('an unknown or missing saved value means System', () => {
  expect(readPreference()).toBe('system')
  localStorage.setItem(THEME_KEY, 'purple')
  expect(readPreference()).toBe('system')
  localStorage.setItem(THEME_KEY, 'dark')
  expect(readPreference()).toBe('dark')
})

test('choosing a theme applies it, saves it, and keeps what the person typed', async () => {
  stubSystem(false)
  render(<ThemeProvider><input aria-label="Note" /><AppearanceControl /></ThemeProvider>)
  expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  await userEvent.type(screen.getByLabelText('Note'), 'half typed')
  await userEvent.selectOptions(screen.getByLabelText('Appearance'), 'dark')
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  expect(localStorage.getItem(THEME_KEY)).toBe('dark')
  expect(screen.getByLabelText('Note')).toHaveValue('half typed')
  await userEvent.selectOptions(screen.getByLabelText('Appearance'), 'system')
  expect(localStorage.getItem(THEME_KEY)).toBeNull()
  expect(document.documentElement).toHaveAttribute('data-theme', 'light')
})

test('live system changes are followed only in System mode', async () => {
  const setSystemDark = stubSystem(false)
  render(<ThemeProvider><AppearanceControl /></ThemeProvider>)
  act(() => setSystemDark(true))
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  await userEvent.selectOptions(screen.getByLabelText('Appearance'), 'light')
  act(() => setSystemDark(false))
  act(() => setSystemDark(true))
  expect(document.documentElement).toHaveAttribute('data-theme', 'light')
})

test('a saved choice is used on the next visit', () => {
  stubSystem(false)
  localStorage.setItem(THEME_KEY, 'dark')
  render(<ThemeProvider><AppearanceControl /></ThemeProvider>)
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  expect(screen.getByLabelText('Appearance')).toHaveValue('dark')
})
