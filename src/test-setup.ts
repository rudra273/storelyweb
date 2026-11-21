import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs without globals here, so Testing Library cannot clean up by itself.
// Drafts and the remembered shop live in localStorage; tests must not inherit each other's.
afterEach(() => { cleanup(); localStorage.clear() })
