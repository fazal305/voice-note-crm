import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, getToken, setToken } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(() => (getToken() ? 'checking' : 'guest'))
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    if (status !== 'checking') return
    let active = true
    api
      .get('/me')
      .then((res) => {
        if (!active) return
        setUser(res.data.user)
        setStatus('authed')
      })
      .catch((err) => {
        if (!active) return
        if (err.response?.status === 401) setStatus('guest')
        else setStatus('unreachable')
      })
    return () => {
      active = false
    }
  }, [status])

  // Opened without a connection: check the session again as soon as it's back, so saved notes can upload.
  useEffect(() => {
    if (status !== 'unreachable') return
    const online = () => setStatus('checking')
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [status])

  useEffect(() => {
    const onExpired = () => {
      setUser(null)
      setExpired(true)
      setStatus('guest')
    }
    window.addEventListener('session-expired', onExpired)
    return () => window.removeEventListener('session-expired', onExpired)
  }, [])

  const signIn = useCallback((token, nextUser) => {
    setToken(token)
    setUser(nextUser)
    setExpired(false)
    setStatus('authed')
  }, [])

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // token may already be invalid; local sign-out still applies
    }
    setToken(null)
    setUser(null)
    setStatus('guest')
  }, [])

  const retry = useCallback(() => setStatus('checking'), [])

  const value = useMemo(() => ({ user, status, expired, signIn, signOut, retry }), [user, status, expired, signIn, signOut, retry])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
