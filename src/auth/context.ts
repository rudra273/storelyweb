import { createContext, useContext } from 'react'
import type { Me } from '../api/types'

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated'

export interface AuthValue {
  status: AuthStatus
  user: Me | null
  /** Why the visitor is signed out, when it was not their own choice. */
  notice: string | null
  clearNotice: () => void
  /** Resolves with an `mfaToken` when a second step is needed, otherwise signs in. */
  login: (email: string, password: string) => Promise<{ mfaToken: string } | null>
  completeMfa: (mfaToken: string, code: string) => Promise<void>
  logout: () => Promise<void>
  reloadUser: () => Promise<void>
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
