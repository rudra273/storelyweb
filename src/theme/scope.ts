import { createContext } from 'react'
export type BindThemeScope = (user: string, shop: string, enabled: boolean, pending: boolean) => () => void
export const ThemeScopeContext = createContext<BindThemeScope | null>(null)
