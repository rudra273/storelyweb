import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, api, clearAccessToken, refreshSession, setSessionLostHandler, storeLogin } from '../api/client'
import type { LoginResult, Me } from '../api/types'
import { AuthContext, type AuthStatus, type AuthValue } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<Me | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const started = useRef(false)

  const signedOut = useCallback(
    (message: string | null) => {
      clearAccessToken()
      queryClient.clear()
      setUser(null)
      setStatus('anonymous')
      setNotice(message)
    },
    [queryClient],
  )

  const loadUser = useCallback(async () => {
    setUser(await api.get<Me>('/v1/me'))
    setStatus('authenticated')
  }, [])

  useEffect(() => {
    setSessionLostHandler(() => signedOut('Your session has ended. Please sign in again.'))
    return () => setSessionLostHandler(null)
  }, [signedOut])

  // On page load the access token (kept in memory only) is gone; the cookie can get one.
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      try {
        if (await refreshSession()) await loadUser()
        else setStatus('anonymous')
      } catch (error) {
        setStatus('anonymous')
        if (error instanceof ApiError && error.code === 'network') setNotice(error.message)
      }
    })()
  }, [loadUser])

  const finish = useCallback(
    async (result: LoginResult) => {
      if (!storeLogin(result)) throw new ApiError(500, 'bad_response', 'Unexpected reply from the server.')
      await loadUser()
    },
    [loadUser],
  )

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      notice,
      clearNotice: () => setNotice(null),
      login: async (email, password) => {
        const result = await api.post<LoginResult>(
          '/v1/auth/login',
          { email, password, client: 'web', device_label: 'Web browser' },
          false,
        )
        if (result.mfa_required && result.mfa_token) return { mfaToken: result.mfa_token }
        await finish(result)
        return null
      },
      completeMfa: async (mfaToken, code) => {
        await finish(await api.post<LoginResult>('/v1/auth/mfa/verify', { mfa_token: mfaToken, code }, false))
      },
      logout: async () => {
        try {
          await api.post('/v1/auth/logout')
        } catch {
          // already gone on the server, or offline: either way this browser forgets it
        }
        signedOut(null)
      },
      reloadUser: loadUser,
    }),
    [status, user, notice, finish, loadUser, signedOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
